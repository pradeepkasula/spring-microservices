const fs = require("fs");
const path = require("path");
const {
  Table, TableRow, TableCell, Paragraph, TextRun, ImageRun, WidthType, ShadingType, AlignmentType, BorderStyle,
} = require("docx");
const L = require("./lib");
const { p, h1, h2, h3, table, callout, spacer, image } = L;

const PATTERNS = [
  {
    key: "dbps", title: "Database per service", img: "pm_dbps.png",
    services: "order, inventory, payment, notification, order-query",
    purpose: "Each service owns its data, so services can change and scale independently.",
    intro: "Every business service owns a private database and exposes its data only through APIs or events. In this project each one has its own in-memory H2 schema; in production, give each its own schema or instance.",
    needs: [
      ["order-service", "`orderdb` with `orders`, `saga_instance`, `outbox_event`; `spring.datasource.url` of its own."],
      ["inventory-service", "`inventorydb` with `stock_item` (seeded BOOK-1, LAPTOP-1) and `reservation`."],
      ["payment-service", "`paymentdb` with `payment` records; credit-limit rule kept in code and config."],
      ["notification-service", "`notificationdb` that holds the idempotency table only."],
      ["order-query-service", "`querydb` with the denormalised `order_summary` read model."],
    ],
    rule: "**Rule.** No foreign keys or joins across services. Cross-service consistency comes from the saga, not from a shared transaction.",
  },
  {
    key: "saga", title: "Saga (orchestration) with compensation", img: "pm_saga.png",
    services: "order (orchestrator), inventory, payment, Kafka",
    purpose: "Keeps data consistent across services without a distributed transaction; undoes work when a step fails.",
    intro: "`order-service` runs the saga as a state machine: RESERVING_STOCK, PROCESSING_PAYMENT, then COMPLETED. If payment is declined it sends ReleaseStock and ends FAILED.",
    needs: [
      ["order-service", "`CreateOrderSaga` (state machine), `SagaInstance` entity, `SagaReplyListener` for replies, `OrderController` that returns 202 Accepted."],
      ["inventory-service", "`InventoryCommandListener` handling `ReserveStock` and `ReleaseStock`; replies with `SagaReply`."],
      ["payment-service", "`PaymentCommandListener` handling `ProcessPayment`; checks `payment.credit-limit`; replies with `SagaReply`."],
      ["common / Kafka", "`Contracts` records and `Topics` constants; topics for commands and replies."],
    ],
    rule: "**Rule.** Every step that changes data needs a compensating action, and every handler must be idempotent.",
  },
  {
    key: "outbox", title: "Transactional outbox and polling publisher", img: "pm_outbox.png",
    services: "order, inventory, payment (publishers), common, Kafka",
    purpose: "Guarantees a message is sent if and only if the database change committed.",
    intro: "A service writes the business change and an `outbox_event` row in one local transaction. A scheduled publisher reads unsent rows, sends them to Kafka and marks them sent. A crash between the two steps only delays delivery.",
    needs: [
      ["common", "`OutboxEvent`, `OutboxRepository`, `OutboxService` (enqueue) and `OutboxPublisher` (poll and send)."],
      ["order / inventory / payment", "Call `OutboxService` inside the same `@Transactional` method that changes business data; each has an `outbox_event` table."],
      ["Kafka", "Topic for each destination; delivery is at-least-once, so consumers must de-duplicate."],
    ],
    rule: "**Rule.** Never call `kafkaTemplate.send` directly inside business code; always write to the outbox.",
  },
  {
    key: "idem", title: "Idempotent consumer", img: "pm_idem.png",
    services: "inventory, payment, order, notification, order-query, common",
    purpose: "Makes duplicate message deliveries harmless.",
    intro: "Each message carries a messageId header. The consumer inserts that id into `processed_message` in the same transaction as its business change. A repeat finds the id and is skipped.",
    needs: [
      ["common", "`IdempotentConsumer`, `ProcessedMessage` entity and repository, `Msg` and `MessageReader` for headers and payload."],
      ["Every listener", "Wrap the handler in `IdempotentConsumer` so the id insert and business update commit together."],
      ["Publishers", "Set a stable messageId (the outbox event id) so retries carry the same id."],
    ],
    rule: "**Rule.** The dedupe check and the business change must be in one transaction, or a crash can still cause a double effect.",
  },
  {
    key: "cqrs", title: "CQRS and domain events", img: "pm_cqrs.png",
    services: "order (command), order-query (query), Kafka, notification",
    purpose: "Separates writes from reads so each can be modelled and scaled independently.",
    intro: "`order-service` handles commands and publishes an `OrderEvent` through the outbox whenever the order changes state. `order-query-service` consumes the events and maintains a read model that serves queries.",
    needs: [
      ["order-service", "Publishes `OrderEvent` for each state change via the outbox."],
      ["order-query-service", "`OrderSummaryProjector` (event listener), `OrderSummary` read entity, `OrderQueryController` for `GET /query/orders`."],
      ["notification-service", "A second subscriber of the same events (`OrderEventNotifier`), showing that events are reusable."],
      ["Kafka", "The `order-events` topic."],
    ],
    rule: "**Rule.** The read model is eventually consistent; a just-created order can take a moment to appear.",
  },
  {
    key: "compose", title: "API composition", img: "pm_compose.png",
    services: "order-query, order, payment, inventory",
    purpose: "Answers a query that needs data from several services without a shared database.",
    intro: "`GET /query/orders/{id}/details` calls order, payment and inventory and merges the results into one response.",
    needs: [
      ["order-query-service", "`OrderDetailsComposer`; a `@LoadBalanced` `RestClient.Builder`; a circuit breaker around each call."],
      ["order-service", "`GET /orders/{id}`."],
      ["payment-service", "`GET /payments/{orderId}`."],
      ["inventory-service", "`GET /inventory/{sku}`."],
    ],
    rule: "**Rule.** Call providers in parallel where possible and return partial data when one is down.",
  },
  {
    key: "gateway", title: "API gateway", img: "pm_gateway.png",
    services: "api-gateway, order, inventory, payment, order-query",
    purpose: "One entry point for clients that handles routing and cross-cutting concerns.",
    intro: "Spring Cloud Gateway on port 8080 routes `/api/**` to the services, removing the leading `/api` (`StripPrefix=1`). It also adds the correlation id, validates tokens and applies circuit breakers.",
    needs: [
      ["api-gateway", "`application.yml` routes (`lb://service`), `SecurityConfig`, `CorrelationIdGlobalFilter`, `FallbackController`, `/mobile/orders/**` rewrite route."],
      ["Downstream services", "Plain REST controllers; they need no knowledge of the gateway and should not be exposed publicly."],
    ],
    rule: "**Rule.** Keep the gateway free of business logic; it only routes and applies cross-cutting policies.",
  },
  {
    key: "token", title: "Access token (JWT)", img: "pm_token.png",
    services: "api-gateway, all downstream services",
    purpose: "Authenticates a caller once and passes proof of identity to every request.",
    intro: "`POST /auth/token` (demo / demo) returns a signed HS256 JWT. The gateway validates the Bearer token on all other routes and returns 401 when it is missing or invalid.",
    needs: [
      ["api-gateway", "`TokenController` (demo issuer), `SecurityConfig` as OAuth2 resource server, shared secret from `JWT_SECRET`."],
      ["Clients", "Send `Authorization: Bearer <token>` on every call."],
      ["Downstream services", "Trust requests from the gateway; protect them with network rules."],
    ],
    rule: "**Rule.** The built-in issuer and secret are for demos. Use a real identity provider in production.",
  },
  {
    key: "breaker", title: "Circuit breaker", img: "pm_breaker.png",
    services: "api-gateway, order-query",
    purpose: "Stops a failing dependency from exhausting threads and failing the whole system.",
    intro: "After repeated failures or timeouts the breaker opens and calls fail fast. The gateway forwards to a fallback; the composer returns partial data.",
    needs: [
      ["api-gateway", "`CircuitBreaker` filter on each route with `fallbackUri`; time limiter of 5 s; `FallbackController`."],
      ["order-query-service", "`Resilience4JCircuitBreakerFactory` customiser and `CircuitBreakerFactory` used in `OrderDetailsComposer`."],
    ],
    rule: "**Rule.** Always define a timeout and a fallback; a breaker without them only moves the failure.",
  },
  {
    key: "discovery", title: "Service registry, self registration and client-side discovery", img: "pm_discovery.png",
    services: "discovery-server, every service, api-gateway",
    purpose: "Services find each other by name instead of fixed addresses.",
    intro: "Each service registers itself with Eureka at startup and sends heartbeats. Callers look up `lb://service-name` and the client chooses a healthy instance.",
    needs: [
      ["discovery-server", "`@EnableEurekaServer` on port 8761."],
      ["Every service", "Eureka client dependency and `spring.application.name` (self registration)."],
      ["api-gateway / order-query", "`lb://` routes, and `@LoadBalanced` clients (client-side discovery)."],
    ],
    rule: "**Rule.** Start the registry first; give each service a unique, stable application name.",
  },
  {
    key: "config", title: "Externalized configuration", img: "pm_config.png",
    services: "config-server, all services (payment-service uses it)",
    purpose: "Changes settings without rebuilding services.",
    intro: "`config-server` on port 8888 serves files from `config-repo/`. Each service imports them with `spring.config.import=optional:configserver:`. `payment-service` reads `payment.credit-limit` (1000) from it.",
    needs: [
      ["config-server", "`@EnableConfigServer`, native `config-repo/application.yml` and `payment-service.yml`."],
      ["Every service", "`spring.config.import` pointing to `CONFIG_SERVER_URL`; `optional:` lets them start without it."],
      ["payment-service", "`payment.credit-limit` property bound to the approval rule."],
    ],
    rule: "**Rule.** Keep secrets out of the repository; use environment variables or a secrets manager.",
  },
  {
    key: "chassis", title: "Microservice chassis", img: "pm_chassis.png",
    services: "common module, then all business services",
    purpose: "Gives every service the same cross-cutting features without copy and paste.",
    intro: "The `common` module is an auto-configuration library. Adding it as a dependency brings the Kafka, JPA and actuator defaults, the correlation-id filter, the error handler, outbox, idempotency and audit logging.",
    needs: [
      ["common", "`ChassisAutoConfiguration`, `chassis.yml`, `CorrelationIdFilter`, `GlobalExceptionHandler`, `AuditLog`, outbox and idempotency classes."],
      ["Every service", "Dependency on `common` and `spring.config.import: classpath:chassis.yml`."],
    ],
    rule: "**Rule.** Keep the chassis infrastructure-only; adding business rules to it couples every service.",
  },
  {
    key: "obs", title: "Observability", img: "pm_obs.png",
    services: "all services (via chassis), Zipkin",
    purpose: "Lets you see health, metrics, traces and a business audit trail across services.",
    intro: "Each service exposes health and metrics, sends traces to Zipkin, and writes logs that carry the trace id and correlation id. `AuditLog` records key business events.",
    needs: [
      ["Every service", "Actuator (`health`, `metrics`, `prometheus`), Micrometer tracing with the Zipkin reporter, `ZIPKIN_URL`."],
      ["order / payment / notification", "`AuditLog.record(...)` calls for order created, payment captured or declined, notification sent."],
      ["Zipkin", "Started from `docker-compose.yml` on port 9411 (optional when running locally)."],
    ],
    rule: "**Rule.** Always log the trace id and correlation id so one request can be followed across services.",
  },
  {
    key: "msg", title: "Messaging and remote procedure invocation", img: "pm_msg.png",
    services: "Kafka, order, inventory, payment, notification, order-query, api-gateway",
    purpose: "Uses REST for client requests and asynchronous messaging between services.",
    intro: "Clients call the system with REST through the gateway. Services talk to each other with Kafka commands, replies and events, so they are not blocked by each other.",
    needs: [
      ["Kafka", "Run `local-kafka` (embedded, port 9092) or the Docker broker."],
      ["Producers", "Publish through the outbox to `Topics` constants."],
      ["Consumers", "`@KafkaListener` methods wrapped in the idempotent consumer."],
      ["REST controllers", "`OrderController`, `InventoryController`, `PaymentController`, `OrderQueryController`."],
    ],
    rule: "**Rule.** Use messaging for state changes that cross services, and REST for queries and client requests.",
  },
];

function pngSize(file) {
  const buf = fs.readFileSync(path.join(__dirname, "img", file));
  return { buf, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "B2BABB" };
const borders = { top: border, bottom: border, left: border, right: border };

function textCell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    children: [new Paragraph({ spacing: { after: 20, line: 240 }, children: L.runs(text, { size: 18, bold: opts.bold, color: opts.color }) })],
  });
}

function imageCell(file, width, px) {
  const { buf, w, h } = pngSize(file);
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({
      type: "png", data: buf, transformation: { width: px, height: Math.round((h * px) / w) },
      altText: { title: file, description: "Architecture of the pattern", name: file } })] })],
  });
}

module.exports = function () {
  const c = [];
  c.push(h1("6. Pattern-to-service guide"));
  c.push(p("This section shows, for each pattern, which services take part, what each one must contain, and how they connect. The final table repeats this in one place."));
  c.push(callout([
    "**Service ports in this project.** order-service 8081, inventory-service 8082, payment-service 8083, notification-service 8084, order-query-service 8085, api-gateway 8080, config-server 8888, discovery-server 8761.",
  ], "EAF2F8", "2E86C1"));

  PATTERNS.forEach((x, i) => {
    c.push(h2("6." + (i + 1) + "  " + x.title));
    c.push(p(x.intro));
    c.push(...image(x.img, "Services involved: " + x.title, 560));
    c.push(table(["Service", "What it needs for this pattern"], x.needs, [2500, 7246]));
    c.push(spacer());
    c.push(callout(x.rule));
  });

  c.push(new Paragraph({ heading: "Heading2", pageBreakBefore: true, children: [new TextRun("6." + (PATTERNS.length + 1) + "  Summary table")] }));
  c.push(p("One row per pattern: the services that take part, the purpose, and the architecture."));
  const widths = [1250, 1750, 1800, 4946];
  const head = new TableRow({ tableHeader: true, children: ["Pattern", "Services included", "Purpose", "Architecture"].map((t, i) => textCell(t, widths[i], { bold: true, fill: "1F4E79", color: "FFFFFF" })) });
  const rows = PATTERNS.map((x, ri) => new TableRow({ cantSplit: true, children: [
    textCell("**" + x.title + "**", widths[0], { fill: ri % 2 ? "F7F9FA" : undefined }),
    textCell(x.services, widths[1], { fill: ri % 2 ? "F7F9FA" : undefined }),
    textCell(x.purpose, widths[2], { fill: ri % 2 ? "F7F9FA" : undefined }),
    imageCell(x.img, widths[3], 320),
  ] }));
  c.push(new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows: [head, ...rows] }));
  c.push(new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: "exact" }, children: [new TextRun({ text: "", size: 2 })] }));
  return c;
};
