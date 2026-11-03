const L = require("./lib");
const { p, h1, h2, h3, bullets, code, callout, spacer, Paragraph, TextRun, runs } = L;

let n = 0;
function qa(q, scenario, answer, extra) {
  n += 1;
  const out = [];
  out.push(new Paragraph({
    keepNext: true, spacing: { before: 220, after: 60 },
    children: [new TextRun({ text: "Q" + n + ". " + q, bold: true, size: 23, color: "1F4E79" })],
  }));
  out.push(new Paragraph({
    keepNext: true, spacing: { after: 60 },
    shading: { type: "clear", fill: "EAF2F8", color: "auto" },
    children: [new TextRun({ text: "Scenario: ", bold: true, italics: true, size: 20 }), ...runs(scenario, { italics: true, size: 20 })],
  }));
  out.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Answer", bold: true, size: 21, color: "1E8449" })] }));
  out.push(...answer.map((t) => (t.startsWith("- ") ? bullets([t.slice(2)])[0] : p(t))));
  if (extra) out.push(...extra);
  return out;
}

module.exports = function () {
  const c = [];
  c.push(h1("4. Interview questions and answers (experienced Java developer)"));
  c.push(p("Questions are written as real situations, in the way a senior interviewer would ask them. Answers are what a strong candidate should cover; several refer to this project so you can show working knowledge. Use the project README for the pattern background."));

  // ---------------------------------------------------------------- A
  c.push(h2("A. Architecture and decomposition"));
  c.push(...qa("How do you decide the service boundaries when breaking up a monolith?",
    "A 40-developer team owns a monolith for orders, stock, payments and notifications. Releases happen once a month and every release is risky.",
    [
      "Start from the business, not from technical layers: use **decompose by business capability** and **bounded contexts** (DDD). Run event storming with the business to find where the language changes (an order means something different to inventory than to payment).",
      "Good boundaries have high cohesion, own their data, and change for the same reason. A service that needs another service database or changes in lockstep with it is a wrong cut.",
      "Do not rewrite. Use the **strangler** approach: put a gateway in front, extract the capability with the highest change rate or scaling need first, move traffic route by route, and keep an anti-corruption layer so legacy concepts do not leak.",
      "Warning signs of a **distributed monolith**: shared database, long synchronous call chains, services deployed together, shared domain libraries that force coordinated releases.",
    ]));
  c.push(...qa("Order service needs the customer credit status owned by another service. Call it synchronously or keep a copy?",
    "The credit service is slow at month end. Orders must still be accepted.",
    [
      "A synchronous call couples **availability and latency**: order availability becomes the product of both services. It is simple and always fresh, so fine for non-critical, low-volume reads.",
      "For the critical path keep a **local replica** (command-side replica) updated from credit events. Orders are accepted from local data and the replica is eventually consistent; you must accept occasionally stale decisions and add a re-check (for example in the payment step).",
      "Middle ground: synchronous call wrapped in timeout, circuit breaker and a cached or default fallback, with the business agreeing what happens when credit is unknown.",
    ]));
  c.push(...qa("When would you advise against microservices?",
    "A startup with 6 developers wants 25 microservices from day one.",
    [
      "Microservices trade code complexity for operational and consistency complexity (deployment, tracing, eventual consistency, versioning). That is worth it when many teams need independent delivery or parts of the system scale differently.",
      "For a small team with an unclear domain, a **modular monolith** with strict module boundaries gives most of the benefit; extract services later when a boundary proves stable. Wrong early boundaries are far more expensive across network calls and databases.",
    ]));

  // ---------------------------------------------------------------- B
  c.push(h2("B. Data consistency and messaging"));
  c.push(...qa("Why not use a distributed transaction (2PC / XA) for the order flow?",
    "A colleague proposes JTA with XA so stock, payment and order commit atomically.",
    [
      "2PC holds locks in every participant while the coordinator decides, reducing throughput and availability; a coordinator failure leaves participants blocked in doubt. Many modern resources (Kafka, REST services, most NoSQL stores) do not support XA at all.",
      "It also couples services at deployment and runtime. A **saga** replaces one atomic transaction by local transactions plus compensations and accepts temporary inconsistency (an order is PENDING for a moment).",
    ]));
  c.push(...qa("Explain orchestration versus choreography and why this project uses orchestration.",
    "A new joiner asks why CreateOrderSaga is one class instead of services reacting to each other events.",
    [
      "**Choreography:** each service publishes events and others react. No central point, but the flow is implicit, hard to see and easy to create cyclic dependencies as steps grow.",
      "**Orchestration:** one orchestrator holds the state machine and sends commands. The flow is explicit, testable and observable (one table shows every order saga state). The cost is a component that knows all steps; keep it a coordinator with no business rules of the participants.",
      "Rule of thumb: choreography for 2-3 simple steps; orchestration when there are compensations, branches or timeouts.",
    ]));
  c.push(...qa("What if the compensating step (ReleaseStock) itself fails or never gets a reply?",
    "Payment declined, ReleaseStock was sent, but inventory-service was down for 30 minutes.",
    [
      "Compensations must be **retryable, idempotent and eventually succeed**: the command stays in the outbox and Kafka retains it, so it is delivered when inventory returns. The saga stays in RELEASING_STOCK, which is visible and alertable.",
      "Add a **saga timeout / watchdog** that finds sagas stuck longer than N minutes, re-sends the command, and escalates to a human with a dead-letter or ticket. Never design compensation that can only fail permanently; if it can, you need a manual remediation process.",
      "Semantic locks (a reservation row, a PENDING state) prevent other flows from using half-finished data meanwhile.",
    ]));
  c.push(...qa("What is the dual-write problem and how does the outbox solve it?",
    "A developer saves the order and then calls kafkaTemplate.send in the same method. Occasionally orders exist with no event.",
    [
      "Two systems cannot be updated atomically. If the app crashes between the DB commit and the send (or the send fails), the database says one thing and the event stream another. Reversing the order just creates ghost events.",
      "The **transactional outbox** writes the event into an outbox table in the same local transaction as the business data. A relay (polling publisher, or CDC such as Debezium) publishes unsent rows. Result: the event is sent **at least once** if and only if the transaction committed.",
      "Details to mention: `Propagation.MANDATORY` on the outbox write, ordering by creation time and keying by aggregate id, purge of old rows, and with several app instances use `SELECT ... FOR UPDATE SKIP LOCKED` or CDC so two relays do not send the same row.",
    ]));
  c.push(...qa("Can you get exactly-once processing with Kafka?",
    "The business says a payment must never be taken twice.",
    [
      "End to end exactly-once does not exist across arbitrary systems. Kafka offers idempotent producers and transactions that give exactly-once **within Kafka** (read-process-write between topics).",
      "In practice use **at-least-once delivery plus an idempotent consumer**, which gives effectively-once outcomes: store the messageId in the same transaction as the side effect, or make the operation naturally idempotent (unique key on orderId, upsert). For calls to an external payment provider pass an **idempotency key** as well.",
    ]));
  c.push(...qa("How do you make the idempotent consumer safe under concurrency, and how does it grow over time?",
    "Two consumer instances receive the same message after a rebalance at nearly the same moment.",
    [
      "The message id is the primary key of `processed_message`. Both transactions try to insert it; one fails with a constraint violation and rolls back its business change, so the effect happens once. Treat that exception as \"duplicate\" and acknowledge.",
      "The table grows forever, so purge entries older than the maximum redelivery window (for example retention of the topic plus a margin), or partition the table by date.",
    ]));
  c.push(...qa("The client posts an order and immediately reads it. How do you design for eventual consistency?",
    "Users complain that the order list does not show their new order for a second.",
    [
      "Make the asynchrony explicit: return **202 Accepted** with the order id and a PENDING status, and give a way to follow progress (GET by id on the command side, polling, server-sent events or webhook).",
      "Read-your-writes for the creator: return the created resource from the command response, or have the UI merge it into the list optimistically. Show a status badge instead of hiding in-progress orders.",
    ]));
  c.push(...qa("How do you evolve event schemas without breaking consumers?",
    "Order service wants to rename `amount` to `totalAmount` and add `currency`.",
    [
      "Prefer **additive, backward-compatible** changes: add optional fields, never rename or change meaning in place. Consumers must be tolerant readers (ignore unknown fields; Jackson FAIL_ON_UNKNOWN_PROPERTIES off).",
      "For a breaking change publish a new version (new type or topic), run both during migration (expand/contract), and retire the old one when consumer-driven contract tests show nobody uses it. Use a schema registry (Avro / Protobuf) with compatibility rules in CI for larger organisations.",
    ]));
  c.push(...qa("The read model is wrong or must get a new column. How do you rebuild it?",
    "Product wants the customer name shown in the order list, which the read model never stored.",
    [
      "Because the read model is derived only from events, deploy a new projector version that writes to a new table or a new service version, **replay the topic from the beginning** (new consumer group with earliest offset), switch queries when it has caught up, then delete the old table.",
      "This needs events with enough data (or enrichment from a replica), idempotent projections, and retention long enough; otherwise keep a compacted topic or an event store.",
    ]));

  // ---------------------------------------------------------------- C
  c.push(h2("C. Resilience"));
  c.push(...qa("A downstream service becomes slow. What exactly protects your service?",
    "payment-service latency rises from 50 ms to 20 s. Within minutes the order-query service stops answering everything.",
    [
      "Slow is worse than down: callers hold threads and connections until they run out (cascading failure). Layers of defence: **timeouts on every remote call**, **circuit breaker** (fail fast when failure or slow-call rate is high), **bulkhead** (separate bounded pools so one dependency cannot take all threads), limited **retries with backoff and jitter** only for idempotent calls, and a sensible **fallback**.",
      "Order matters: time limiter and bulkhead inside, circuit breaker around, retry outermost with care so retries do not multiply load on a struggling service (retry storm).",
      "In this project `OrderDetailsComposer` wraps each downstream call in a Resilience4j breaker with a 2 s time limit and returns `UNAVAILABLE` for just that part.",
    ]));
  c.push(...qa("How do you tune a circuit breaker and decide the fallback?",
    "The breaker opens during a short blip and users see degraded data for long.",
    [
      "Key settings: sliding window size and type, failure-rate threshold, slow-call threshold, minimum number of calls, wait duration in open state, permitted calls in half-open. Too small a window makes it flap; too large reacts late. Tune from real latency percentiles, not guesses.",
      "A fallback must be a **business decision**: cached or stale data, default value, partial response, or an explicit error. Never fake success for writes (for example pretending a payment worked). Monitor breaker state and fallback rate as metrics.",
    ]));
  c.push(...qa("Users get 503 from the gateway although the service is healthy. What do you check?",
    "After stopping payment-service, the first call to order details returned the gateway fallback although the query service answers correctly when called directly.",
    [
      "This happened during development of this project. Compare the **timeout of each layer**: the gateway circuit breaker has a time limiter (default 1 s) shorter than the time the composed call can legitimately take (load balancer retries plus the 2 s downstream limit).",
      "Fix: align timeouts so outer layers are longer than inner ones (client > gateway > service > downstream), set the gateway limit explicitly, and test with a dependency down, not only with everything up.",
    ]));

  // ---------------------------------------------------------------- D
  c.push(h2("D. Security"));
  c.push(...qa("Is validating the JWT only at the gateway enough?",
    "Security review finds that any pod inside the cluster network can call order-service directly.",
    [
      "No - it is **perimeter-only** security. Apply defence in depth (zero trust): each service validates the token (resource server, issuer and audience checks, scopes/roles) or the mesh enforces mTLS and authorisation, and network policies restrict who can call what.",
      "Forward the user token (or exchange it for a narrower one) so the service can authorise by subject; for service-to-service calls without a user use the OAuth2 client-credentials grant or mTLS identities.",
      "Operational points: short token lifetime with refresh, revocation strategy, and asymmetric signing with a JWKS endpoint and key ids so keys can rotate without an outage. The project uses HS256 with a shared secret for simplicity and says so.",
    ]));

  // ---------------------------------------------------------------- E
  c.push(h2("E. Spring, JPA and Kafka specifics"));
  c.push(...qa("What are the common @Transactional mistakes in a service like this?",
    "A developer annotates a private method, calls it from the same class, and rollbacks do not happen. Another calls a REST service inside the transaction.",
    [
      "**Self-invocation** and **private/final methods** bypass the proxy so the annotation is ignored; move the logic to another bean or use `TransactionTemplate`.",
      "By default only unchecked exceptions roll back; use `rollbackFor` for checked ones.",
      "Never hold a transaction while doing remote calls or sending to Kafka: it keeps a DB connection busy (pool exhaustion) and cannot be rolled back. This is exactly why the outbox exists.",
      "Know propagation: `REQUIRED` default, `REQUIRES_NEW` for independent commits (audit), `MANDATORY` to enforce a surrounding transaction (used by `OutboxService`).",
    ]));
  c.push(...qa("Two orders for the last item arrive at the same time. Is the inventory service safe?",
    "Both reserve 1 unit of a SKU with stock 1.",
    [
      "In this project commands go through one single-partition topic, so they are processed one at a time, which hides the problem. With more partitions or several instances two transactions can read available=1 and both decrement - a **lost update** and overselling.",
      "Fixes: **optimistic locking** (`@Version` on `StockItem`, retry on `OptimisticLockException`), a conditional update (`UPDATE stock SET available = available - :q WHERE sku = :s AND available >= :q`), or pessimistic locking for hot rows; also key messages by SKU so one SKU is handled in order.",
    ]));
  c.push(...qa("Why is spring.jpa.open-in-view set to false, and how do you avoid N+1 queries?",
    "A list endpoint becomes slow after adding a relationship.",
    [
      "Open-in-view keeps the EntityManager (and a DB connection) open for the whole web request, hides lazy-loading problems and can exhaust the pool; disable it and load what the use case needs in the service layer.",
      "N+1: fetch joins or `@EntityGraph`, batch fetching (`hibernate.default_batch_fetch_size`), or projections/DTOs for read endpoints. Verify with SQL logging or Hibernate statistics in tests.",
    ]));
  c.push(...qa("A Kafka consumer keeps rebalancing and a message is processed repeatedly.",
    "Lag grows and the same orderId appears again and again in the logs.",
    [
      "Likely causes: processing slower than `max.poll.interval.ms` (consumer kicked out, then the offset was not committed), or a **poison message** that always throws (the default error handler retries, then skips or loops depending on configuration).",
      "Actions: measure processing time, reduce `max.poll.records` or move heavy work off the poll thread, raise the interval, configure `DefaultErrorHandler` with backoff and a **dead-letter topic**, and keep handlers idempotent. Remember: parallelism is limited by partition count, and order is guaranteed only per partition (key by aggregate id).",
    ]));
  c.push(...qa("Eureka versus Kubernetes service discovery, and what can go wrong with Eureka?",
    "A pod was killed but callers kept sending requests to it for a minute and got errors.",
    [
      "Eureka is client-side discovery with an AP registry: clients cache the registry and instances are removed after missed heartbeats (default about 90 s), and self-preservation mode can keep dead instances. Mitigate with shorter lease and cache intervals, graceful shutdown (deregister first), client retries on idempotent calls, and circuit breakers.",
      "On Kubernetes a Service plus readiness probes does server-side discovery, so Eureka is usually unnecessary. Keep Spring Cloud LoadBalancer only if you need client-side balancing.",
    ]));
  c.push(...qa("How do you manage configuration and secrets across environments?",
    "A credit limit must change without a redeploy, and database passwords must not be in Git.",
    [
      "Externalize everything environment-specific: Config Server (git-backed, profiles per environment) or Kubernetes ConfigMaps; refresh via `@RefreshScope` plus actuator refresh or Spring Cloud Bus, or a rolling restart.",
      "Secrets belong in Vault, cloud secret managers or Kubernetes Secrets (encrypted at rest), injected as environment variables or mounted files - never in config repos in clear text. Review and audit config changes like code, and record them next to deployments.",
    ]));

  // ---------------------------------------------------------------- F
  c.push(h2("F. Testing, delivery and operations"));
  c.push(...qa("What is your testing strategy for a system of many services?",
    "End-to-end tests take 40 minutes and fail randomly.",
    [
      "Shift to the **test pyramid for microservices**: many unit tests; **service component tests** (the service with real DB, external collaborators stubbed - see `OrderSagaComponentTest`); **consumer-driven contract tests** (Spring Cloud Contract or Pact) so producer builds fail when they break a consumer; a handful of end-to-end journeys against a deployed environment.",
      "Use Testcontainers for real Kafka/PostgreSQL in CI, test failure modes (broker down, duplicate message, slow dependency), and run synthetic checks after each deployment.",
    ]));
  c.push(...qa("How do you deploy a change that alters the database and the message format without downtime?",
    "Order service v2 needs a new non-null column and a new event field.",
    [
      "Use **expand / contract**: release 1 adds the column as nullable and writes both; backfill; release 2 reads the new column; release 3 removes the old one. Same idea for messages: add fields first, switch consumers, then remove.",
      "Rolling or canary deployment with readiness probes, backward-compatible APIs, schema migrations with Flyway/Liquibase run before the new version, and automatic rollback on error-rate increase.",
    ]));
  c.push(...qa("A support agent reports one order is stuck. How do you follow it across six services?",
    "No error is visible; the customer only has the order number.",
    [
      "Search logs by **correlation id** (created at the gateway, copied to MDC and Kafka headers) and by `traceId` in Zipkin to see each hop and its latency. Read the saga state (`saga_instance`), check unsent `outbox_event` rows, and consumer group lag for the topic where the flow stopped.",
      "Audit logs show business decisions (payment declined), metrics show where rates changed. This is why correlation ids and structured logs are part of the chassis rather than something each team invents.",
    ]));
  c.push(...qa("Traffic grows ten times for a sale. What do you change?",
    "Black Friday; the order flow must process 10x orders per second.",
    [
      "Find the bottleneck with load tests first. Typical steps: more topic partitions keyed by orderId/SKU and matching consumer instances; connection pool and DB indexes sized from measurements; batch the outbox relay or switch to CDC; scale stateless services horizontally and keep reads on the CQRS model (cache hot queries).",
      "Protect the system: rate limit at the gateway, bulkheads, backpressure, graceful degradation (accept orders asynchronously), and autoscaling on lag rather than CPU for consumers.",
    ]));
  return c;
};
