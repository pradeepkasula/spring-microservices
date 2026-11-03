const L = require("./lib");
const { p, h1, h1nb, h2, h3, bullets, numbered, code, table, callout, spacer, image } = L;

module.exports = function () {
  const c = [];

  // ------------------------------------------------------------------ 1. overview
  c.push(h1("1. Project overview"));
  c.push(p("This project is a runnable Spring Boot 3.3 / Spring Cloud 2023.0 system that demonstrates the patterns from the microservices.io pattern language. The business domain is deliberately small - **placing an order** - so that every pattern has a visible job to do."));
  c.push(p("A client logs in, places an order through the API gateway, and a saga coordinates stock reservation and payment across independent services that each own their own database. Services talk to each other through Kafka events and commands, and a separate read model answers queries."));
  c.push(...image("architecture.png", "Figure 1 - System architecture"));
  c.push(h2("Modules"));
  c.push(table(["Module", "Port", "Responsibility", "Main patterns"], [
    ["common", "-", "Shared chassis: outbox, idempotent consumer, correlation id, error handler, audit log, shared config", "Microservice chassis, Transactional outbox, Idempotent consumer"],
    ["discovery-server", "8761", "Eureka service registry", "Service registry, Self registration"],
    ["config-server", "8888", "Serves configuration files to services", "Externalized configuration"],
    ["api-gateway", "8080", "Single entry point: JWT check, routing, fallbacks, correlation id", "API gateway, Access token, Circuit breaker, BFF-style routes"],
    ["order-service", "8081", "Order aggregate and saga orchestrator", "Saga, Aggregate, Domain event, Database per service"],
    ["inventory-service", "8082", "Stock levels and reservations", "Saga participant, Idempotent consumer"],
    ["payment-service", "8083", "Payments with a configurable credit limit", "Saga participant, Externalized configuration"],
    ["notification-service", "8084", "Reacts to order events", "Domain event subscriber, Messaging"],
    ["order-query-service", "8085", "Read model and composed order details", "CQRS, API composition, Circuit breaker"],
    ["local-kafka", "9092*", "Kafka inside one JVM for running without Docker (dev only)", "-"],
  ], [1900, 700, 3846, 3300]));
  c.push(spacer());
  c.push(h2("Technology stack"));
  c.push(...bullets([
    "Java 17, Spring Boot 3.3.5, Spring Cloud 2023.0.3 (Gateway, Eureka, Config, LoadBalancer, Resilience4j)",
    "Spring Data JPA with one in-memory H2 database per service (swap for PostgreSQL in production)",
    "Apache Kafka for messaging (embedded single-node Kafka provided for local runs, Docker image provided for compose)",
    "Micrometer, Prometheus registry and Zipkin for metrics and tracing; Spring Security OAuth2 resource server for JWT",
    "Maven multi-module build, one Dockerfile for all services, docker-compose for infrastructure",
  ]));
  c.push(callout("**Scope note.** The code is a teaching reference, not a production system. Known simplifications: in-memory databases, a single-partition Kafka topic, no dead-letter topic, a demo-only token endpoint, and no gateway rate limiting (see the last section of the README)."));

  // ------------------------------------------------------------------ 2. how to run
  c.push(h1("2. How to run the code"));
  c.push(h2("2.1 Prerequisites"));
  c.push(...bullets([
    "**JDK 17** on the path used to start the services. Check with `java -version`; on machines where an older Java is first on the PATH, call the JDK 17 binary explicitly.",
    "**Maven 3.9+** (`mvn -v` must report Java 17).",
    "**Docker** is optional. Section 2.3 runs everything without it.",
    "Free ports: 8761, 8888, 8080 (or set `SERVER_PORT` for the gateway), 8081-8085, and the Kafka port.",
  ]));
  c.push(h2("2.2 Build and test"));
  c.push(...code(["mvn -B verify          # compiles all modules and runs the tests (no Kafka needed)", "mvn -B -DskipTests package   # faster: only build the jars"]));
  c.push(p("The tests are a **service component test** (`OrderSagaComponentTest`: happy path, compensation, out-of-stock) and a **consumer contract test** (`ReserveStockContractTest`: message shape and duplicate delivery). They run with Kafka switched off."));

  c.push(h2("2.3 Run without Docker"));
  c.push(p("Open one terminal per process from the project root. Start them in this order. The embedded Kafka prints the port it chose (for example `LOCAL KAFKA READY on localhost:63088`); the services read it from the `KAFKA_BOOTSTRAP` environment variable."));
  c.push(...numbered([
    "**Kafka:** `mvn -pl local-kafka exec:java` and note the printed port.",
    "**Registry:** `java -jar discovery-server/target/discovery-server-1.0.0.jar`",
    "**Config:** `java -jar config-server/target/config-server-1.0.0.jar`",
    "**Business services** (each in its own terminal, with `KAFKA_BOOTSTRAP` set): order, inventory, payment, notification and order-query service jars.",
    "**Gateway:** `java -jar api-gateway/target/api-gateway-1.0.0.jar` (set `SERVER_PORT=8090` if 8080 is already used on your machine).",
  ]));
  c.push(p("Example for one service in Windows PowerShell and in a bash shell:"));
  c.push(...code([
    "# PowerShell",
    "$env:KAFKA_BOOTSTRAP = \"localhost:63088\"",
    "java -jar order-service/target/order-service-1.0.0.jar",
    "",
    "# bash / Git Bash",
    "KAFKA_BOOTSTRAP=localhost:63088 java -jar order-service/target/order-service-1.0.0.jar",
  ]));
  c.push(p("Each service needs about 20-60 seconds to start when many JVMs share one machine. Check `http://localhost:8761` to see all instances registered in Eureka."));

  c.push(h2("2.4 Run with Docker (optional)"));
  c.push(...code(["docker compose up -d                       # Kafka + Zipkin only; run the services from your IDE or jars", "docker compose --profile apps up -d --build   # everything in containers"]));

  c.push(h2("2.5 Try it"));
  c.push(p("Replace `8080` with your gateway port. The first call obtains a JWT from the demo endpoint; all other gateway calls need it."));
  c.push(...code([
    "TOKEN=$(curl -s -X POST localhost:8080/auth/token -H 'Content-Type: application/json' \\",
    "  -d '{\"username\":\"demo\",\"password\":\"demo\"}' | sed 's/.*\"access_token\":\"\\([^\"]*\\)\".*/\\1/')",
    "",
    "# 1) happy path -> status becomes APPROVED",
    "curl -s -X POST localhost:8080/api/orders -H \"Authorization: Bearer $TOKEN\" -H 'Content-Type: application/json' \\",
    "  -d '{\"customerId\":\"c1\",\"sku\":\"BOOK-1\",\"quantity\":2,\"amount\":40.00}'",
    "",
    "# 2) payment over the 1000 credit limit -> stock released, status REJECTED",
    "curl -s -X POST localhost:8080/api/orders -H \"Authorization: Bearer $TOKEN\" -H 'Content-Type: application/json' \\",
    "  -d '{\"customerId\":\"c1\",\"sku\":\"LAPTOP-1\",\"quantity\":1,\"amount\":1500.00}'",
    "",
    "curl -s \"localhost:8080/api/query/orders?customerId=c1\"   -H \"Authorization: Bearer $TOKEN\"   # CQRS read side",
    "curl -s localhost:8080/api/query/orders/<id>/details       -H \"Authorization: Bearer $TOKEN\"   # API composition",
    "curl -s localhost:8080/mobile/orders/<id>                  -H \"Authorization: Bearer $TOKEN\"   # BFF-style route",
  ]));
  c.push(h3("What you should see (verified run)"));
  c.push(table(["Check", "Result observed"], [
    ["Order 1: BOOK-1, 2 x 40.00", "Created as PENDING (HTTP 202), then **APPROVED**; inventory shows available 98, reserved 2"],
    ["Order 2: LAPTOP-1, 1500.00", "**REJECTED**, reason \"Credit limit exceeded\"; stock compensated back to available 5, reserved 0"],
    ["Gateway without token", "HTTP 401"],
    ["Query service", "Both orders listed with their final status; payment of order 2 shown as DECLINED in the composed details"],
    ["payment-service stopped", "Details endpoint still answers 200 with \"payment\": {\"status\": \"UNAVAILABLE\"}; order and stock data intact"],
  ], [3200, 6546]));
  c.push(spacer());
  c.push(h2("2.6 Troubleshooting"));
  c.push(table(["Symptom", "Cause", "Fix"], [
    ["Orders stay PENDING; logs show \"Connection to node -1 could not be established\"", "Services point at a Kafka port that is not the one the broker uses", "Start services with the exact `KAFKA_BOOTSTRAP` printed by local-kafka"],
    ["`UnsupportedClassVersionError` or class not found when starting a jar", "An old Java (for example 8) is first on the PATH", "Use the JDK 17 `java` executable"],
    ["Gateway fails with \"Port 8080 was already in use\"", "Another program uses 8080", "Set `SERVER_PORT=8090`"],
    ["Gateway returns 503 \"Service temporarily unavailable\"", "Circuit breaker fallback: target service down, still registering, or slower than the gateway time limit (5 s)", "Wait for the registry to list the instance; check the service log"],
    ["Services log Eureka connection warnings", "discovery-server not running", "Start it first, or ignore; services retry"],
  ], [3400, 3400, 2946]));

  // ------------------------------------------------------------------ 3. pattern flows
  c.push(h1("3. Pattern flows explained with diagrams"));
  c.push(p("Each flow below shows what happens at runtime, which classes are involved, and why the pattern exists. A complete pattern-by-pattern catalog (including the patterns that are deployment or organisational choices) is in the project README."));

  c.push(h2("3.1 Saga (orchestration) - happy path"));
  c.push(p("**Problem.** Creating an order touches three databases (orders, inventory, payments). A single ACID transaction across services is not available, so consistency is achieved with a sequence of local transactions."));
  c.push(...image("saga_happy.png", "Figure 2 - Create-order saga, happy path", 560));
  c.push(...bullets([
    "`CreateOrderSaga.start` saves the order as PENDING, creates a `saga_instance` row and writes outbox rows - all in one local transaction - and returns HTTP 202.",
    "Each participant (`InventoryCommandListener`, `PaymentCommandListener`) performs its local transaction and answers with a `SagaReply` through its own outbox.",
    "`SagaReplyListener` hands each reply to `CreateOrderSaga.onReply`, a small state machine: RESERVING_STOCK -> PROCESSING_PAYMENT -> COMPLETED.",
    "The saga state is persisted, so the orchestrator survives restarts and can be inspected with one SQL query.",
  ]));

  c.push(h2("3.2 Saga - compensation"));
  c.push(p("When a later step fails, earlier steps must be undone with **compensating transactions**. A payment above the credit limit (configured in the config server) is declined, and the stock reserved in step 1 is released."));
  c.push(...image("saga_comp.png", "Figure 3 - Compensation when payment fails", 520));
  c.push(...bullets([
    "Reservation and release are both idempotent, so a repeated command cannot double-count stock.",
    "The order keeps the failure reason (`Credit limit exceeded`) and the final domain event `OrderRejected` is published.",
    "If the first step fails (out of stock) there is nothing to compensate and the order is rejected immediately.",
  ]));

  c.push(h2("3.3 Transactional outbox, polling publisher and idempotent consumer"));
  c.push(p("**Problem (dual write).** Saving to the database and sending to Kafka are two systems; one can succeed while the other fails. The outbox stores the message in the same database transaction as the business data, and a relay sends it later."));
  c.push(...image("outbox.png", "Figure 4 - Reliable messaging", 620));
  c.push(...bullets([
    "`OutboxService.publish` uses propagation MANDATORY: calling it outside a transaction fails fast.",
    "`OutboxPublisher` polls every 500 ms, sends each row with a messageId header, then marks it sent. Delivery is **at-least-once**.",
    "`IdempotentConsumer.runOnce` inserts the messageId into `processed_message` in the same transaction as the business change, so a duplicate is skipped.",
    "Alternative to polling: Debezium reading the database log (transaction log tailing) - consumers stay the same.",
  ]));

  c.push(h2("3.4 Domain events and CQRS"));
  c.push(p("Writes go through the order service. Reads are served by `order-query-service`, which keeps a denormalised `order_summary` table fed only by `order-events`. Notification is a second independent subscriber."));
  c.push(...image("cqrs.png", "Figure 5 - Domain events feeding the read model", 620));
  c.push(...bullets([
    "Queries never call other services, so they stay fast and available when the command side is busy or down.",
    "The read model is **eventually consistent**: a few hundred milliseconds behind the write.",
    "A new view can be built by replaying the topic into a new projector.",
  ]));

  c.push(h2("3.5 API gateway and access token"));
  c.push(...image("gateway.png", "Figure 6 - Gateway request path", 600));
  c.push(...bullets([
    "Every route except `/auth/token`, `/actuator/**` and `/fallback/**` requires a valid JWT (HS256 here, validated by Spring Security as an OAuth2 resource server).",
    "`CorrelationIdGlobalFilter` creates `X-Correlation-Id` when the client did not send one; services copy it to the logging context and into Kafka headers.",
    "Routes use `lb://service-name`, resolved through Eureka (client-side discovery). `/mobile/orders/**` is rewritten to the query service to show a client-specific (BFF-style) API.",
    "The `/auth/token` endpoint is a **demo** issuer. A real deployment uses Keycloak, Okta or Entra ID.",
  ]));

  c.push(h2("3.6 Service registry and externalized configuration"));
  c.push(...image("discovery.png", "Figure 7 - Startup sequence", 600));
  c.push(...bullets([
    "On startup each service imports `optional:configserver:` and `chassis.yml`; the payment credit limit lives in `config-server/.../payment-service.yml`.",
    "The service registers itself with Eureka and sends heartbeats (self registration); callers fetch the registry and load balance (client-side discovery).",
    "On Kubernetes the platform provides discovery (server-side discovery) and ConfigMaps/Secrets, and Eureka/config-server can be dropped.",
  ]));

  c.push(h2("3.7 Circuit breaker and API composition"));
  c.push(p("`OrderDetailsComposer` joins data from order, payment and inventory services. Each call goes through a Resilience4j circuit breaker with a 2 s time limit. When a dependency fails repeatedly the breaker opens and the answer contains a degraded part instead of failing the whole request."));
  c.push(...image("breaker.png", "Figure 8 - Circuit breaker states", 600));
  c.push(...code([
    "{ \"order\":   { ... \"status\": \"REJECTED\" },",
    "  \"payment\": { \"status\": \"UNAVAILABLE\", \"service\": \"payment-service\" },   <- breaker fallback",
    "  \"stock\":   { \"sku\": \"LAPTOP-1\", \"available\": 5, \"reserved\": 0 } }",
  ]));
  c.push(callout("**Lesson from the verified run.** The gateway has its own circuit breaker and Resilience4j time limiter whose default is 1 second. The first composed call after payment-service was stopped took just over one second and the gateway answered with its own 503 fallback even though the query service itself would have answered correctly. The gateway time limit is now set to 5 s (`resilience4j.timelimiter.configs.default.timeout-duration`). Always align timeouts layer by layer: client > gateway > service > downstream."));

  c.push(h2("3.8 Observability"));
  c.push(...image("observability.png", "Figure 9 - Observability signals", 600));
  c.push(...bullets([
    "**Health check API:** `/actuator/health` with liveness and readiness probes.",
    "**Application metrics:** `/actuator/prometheus` (Micrometer).",
    "**Distributed tracing:** Micrometer Tracing (Brave) to Zipkin on port 9411; traceId appears in every log line.",
    "**Log aggregation / audit / exception tracking:** logs carry service name, traceId and correlation id; `AuditLog` writes business actions to an `AUDIT` logger; `GlobalExceptionHandler` is the single place that logs unexpected errors.",
  ]));

  c.push(h2("3.9 Pattern quick index"));
  c.push(table(["Pattern", "Where in the project"], [
    ["Microservice architecture, Decompose by business capability / subdomain", "Module layout; one service per capability"],
    ["Database per service", "Each service has its own datasource URL (orderdb, inventorydb, ...)"],
    ["Saga, Aggregate, Domain event", "`CreateOrderSaga`, `Order`, `OrderEvent`"],
    ["Transactional outbox, Polling publisher, Idempotent consumer", "`OutboxService`, `OutboxPublisher`, `IdempotentConsumer` in `common`"],
    ["CQRS, API composition", "`order-query-service`: `OrderSummaryProjector`, `OrderDetailsComposer`"],
    ["API gateway, Access token, BFF, Circuit breaker", "`api-gateway` and `OrderDetailsComposer`"],
    ["Service registry, Self registration, Client-side discovery", "`discovery-server`, Eureka client in the chassis, `lb://` routes"],
    ["Externalized configuration, Microservice chassis, Service template", "`config-server`, `common` module, identical module structure and Dockerfile"],
    ["Service component test, Consumer-driven contract test", "`OrderSagaComponentTest`, `ReserveStockContractTest`"],
    ["Health check, Metrics, Tracing, Audit logging, Log aggregation, Exception tracking", "Actuator, Micrometer, Zipkin, `AuditLog`, MDC correlation id, `GlobalExceptionHandler`"],
    ["Service instance per container", "`Dockerfile`, `docker-compose.yml`"],
    ["Documented only (not coded)", "Event sourcing, Transaction log tailing, Strangler, Anti-corruption layer, Server-side discovery, Serverless, Service mesh, UI composition"],
  ], [4600, 5146]));

  return c;
};
