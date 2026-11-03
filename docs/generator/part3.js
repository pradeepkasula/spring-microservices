const L = require("./lib");
const { p, h1, h2, h3, bullets, numbered, code, table, callout, spacer, image } = L;

function incident(num, title, img, o) {
  const c = [];
  c.push(new L.Paragraph({ heading: "Heading2", keepNext: true, spacing: { before: 400, after: 100 }, children: [new L.TextRun("Incident " + num + ": " + title)] }));
  c.push(table(["Severity", "Impact", "Affected pattern"], [[o.sev, o.impact, o.pattern]], [1400, 5446, 2900]));
  c.push(spacer());
  c.push(p("**Scenario.** " + o.scenario));
  c.push(...image(img, "Triage flow - incident " + num, 520));
  c.push(h3("How to detect it"));
  c.push(...bullets(o.detect));
  c.push(h3("How to diagnose it"));
  c.push(...bullets(o.diagnose));
  if (o.cmds) c.push(...code(o.cmds));
  c.push(h3("Immediate mitigation (stop the bleeding)"));
  c.push(...numbered(o.mitigate));
  c.push(h3("Permanent fix and prevention"));
  c.push(...bullets(o.fix));
  if (o.note) { c.push(spacer()); c.push(callout(o.note)); }
  return c;
}

module.exports = function () {
  const c = [];
  c.push(h1("5. Real-time incident scenarios and how to handle them"));
  c.push(p("These are the incidents that typically occur in a Spring Boot / Kafka microservice landscape like this one. Each follows the same shape: **detect -> diagnose -> mitigate -> fix and prevent**. Two of them (incidents 1 and 3) and one more (incident 8) actually occurred while this project was being built and run, and are marked as such."));
  c.push(callout([
    "**General incident routine.**",
    "1) Acknowledge and declare severity.  2) Check what changed (deploys, config, traffic).  3) Stabilise first (rollback, scale, disable), investigate second.  4) Communicate status regularly.  5) Write a blameless post-mortem with actions and owners.",
  ], "EAF2F8", "2E86C1"));
  c.push(spacer());

  c.push(...incident(1, "Orders stuck in PENDING", "inc1.png", {
    sev: "SEV-2", impact: "Customers see no confirmation; stock and payment may be half processed.", pattern: "Saga, Transactional outbox, Messaging",
    scenario: "Support reports that new orders never leave PENDING. The API returns 202, but no order becomes APPROVED or REJECTED. This happened for real when the services were started with the wrong Kafka port: every send failed, the outbox rows stayed unsent and the saga never advanced.",
    detect: [
      "Business alert: number of orders PENDING longer than 5 minutes greater than zero.",
      "Metric/alert on the oldest unsent `outbox_event` and on consumer group lag.",
      "Logs: `OutboxPublisher` warnings (\"Outbox relay failed ... will retry\") and Kafka client warnings such as \"Connection to node -1 could not be established\".",
    ],
    diagnose: [
      "Find where the flow stopped by reading the saga state: stuck in RESERVING_STOCK means the command never reached or was never answered by inventory; PROCESSING_PAYMENT points at payment.",
      "If unsent outbox rows keep growing, the problem is between the service and the broker (network, wrong bootstrap address, broker down). If outbox is empty but lag grows, a consumer is stuck.",
      "Search all logs with the order correlation id to see the last service that touched it.",
    ],
    cmds: [
      "-- order-service database",
      "select state, count(*) from saga_instance group by state;",
      "select count(*), min(created_at) from outbox_event where sent = false;",
      "",
      "# Kafka",
      "kafka-consumer-groups.sh --bootstrap-server <host:port> --describe --group inventory-service",
    ],
    mitigate: [
      "Restore connectivity (correct `KAFKA_BOOTSTRAP`, restart broker, fix security group). The outbox relays the backlog automatically in order.",
      "If a consumer is stuck, restart or scale it; if one poison message blocks a partition, move it to a dead-letter topic and continue.",
      "After recovery verify that the PENDING count falls to zero; reply to affected customers if needed.",
    ],
    fix: [
      "Add a **saga timeout watchdog**: sagas older than N minutes are retried or compensated and raise an alert.",
      "Alert on the age of the oldest unsent outbox row (should be seconds).",
      "Dead-letter topic with backoff for failing messages; startup check that fails fast when Kafka is unreachable.",
    ],
  }));

  c.push(...incident(2, "Customer charged twice (duplicate message)", "inc2.png", {
    sev: "SEV-1 (money)", impact: "Wrong charges, refunds, trust and compliance exposure.", pattern: "Idempotent consumer, Messaging",
    scenario: "A consumer rebalance happens while payment-service is processing ProcessPayment. Kafka redelivers the same message to another instance. Without protection a second charge is created for the same order.",
    detect: [
      "Customer complaint or reconciliation job: two captured payments for one order id.",
      "Audit log shows two `PAYMENT_CAPTURED` lines with the same orderId.",
      "Logs show `Duplicate message ... ignored` should have appeared but did not.",
    ],
    diagnose: [
      "Look at the Kafka headers: same `messageId` twice? Then deduplication failed. Different ids for the same business operation means the **producer** emitted two commands (for example a retried HTTP request creating two orders).",
      "Check that the dedupe insert and the business update are in the same transaction; a dedupe row written in a separate transaction is lost on crash.",
      "Check rebalances and processing time versus `max.poll.interval.ms`.",
    ],
    cmds: [
      "select order_id, count(*) from payment group by order_id having count(*) > 1;",
      "select * from processed_message where id like 'payment-service:%' order by processed_at desc;",
    ],
    mitigate: [
      "Refund the duplicate charge through the payment provider; record the correction in the audit log.",
      "Pause the consumer if duplicates are still being created, then fix and resume.",
      "Run a reconciliation query for the incident window to find all affected orders.",
    ],
    fix: [
      "Idempotent consumer with the message id stored in the **same transaction** as the business update (already implemented in `IdempotentConsumer`).",
      "Database unique constraint on the business key (`payment.order_id` is the primary key here), so a second insert fails.",
      "Pass an **idempotency key** to the external payment provider; make client POSTs idempotent with an `Idempotency-Key` header.",
      "Chaos test: kill the consumer mid-processing and verify a single effect.",
    ],
  }));

  c.push(...incident(3, "Slow payment-service causes cascading failure", "inc3.png", {
    sev: "SEV-1", impact: "Increasing 5xx and timeouts across several services; order details unavailable.", pattern: "Circuit breaker, API gateway, Timeouts",
    scenario: "payment-service latency rises from milliseconds to many seconds after a slow database query. Callers keep waiting, exhaust their thread and connection pools, and healthy services start failing too. A smaller real example from this project: with payment-service stopped, the first composed call exceeded the gateway default time limit of 1 s and the gateway answered 503 although the query service itself was fine.",
    detect: [
      "Gateway latency and 5xx alerts; circuit breaker metrics show OPEN.",
      "Thread pool, Tomcat and Hikari pool saturation graphs; GC pauses.",
      "Zipkin traces where almost all time is spent in the payment span.",
    ],
    diagnose: [
      "Open a slow trace in Zipkin to find the slow hop, then look at that service metrics and database.",
      "Take a thread dump of a caller: many threads waiting on the same remote call confirm exhaustion.",
      "Ask what changed in the last hour: deploy, config, new index missing, traffic spike.",
    ],
    cmds: [
      "curl -s localhost:8083/actuator/metrics/http.server.requests",
      "curl -s localhost:8085/actuator/health",
      "jcmd <pid> Thread.print > threads.txt",
    ],
    mitigate: [
      "Let breakers fail fast and serve fallbacks; do not add retries.",
      "Roll back the last deploy or scale the slow service out; if it is a database problem, kill the long queries.",
      "Shed load at the gateway (reduce traffic, disable optional features) until latency recovers.",
    ],
    fix: [
      "Timeouts on every remote call and aligned layer by layer (client > gateway > service > downstream); the gateway limit is now 5 s.",
      "Bulkheads per dependency, retries only for idempotent calls with backoff and jitter.",
      "Load and chaos tests with a dependency slowed down, and alerts on p95/p99 latency, not only errors.",
    ],
  }));

  c.push(...incident(4, "Wrong configuration pushed to the config server", "inc4.png", {
    sev: "SEV-2", impact: "Legitimate payments declined; revenue loss.", pattern: "Externalized configuration, Saga compensation",
    scenario: "An engineer changes `payment.credit-limit` from 1000 to 100 in the config repository by mistake. After instances restart, most orders are rejected with \"Credit limit exceeded\" and stock is released again and again.",
    detect: [
      "Spike in `PAYMENT_DECLINED` audit events and in REJECTED orders.",
      "Change history of the config repository shows a commit shortly before the spike.",
    ],
    diagnose: [
      "Ask the config server what a service actually receives, then compare with the previous commit.",
      "Check which instances loaded the new value (instances that did not restart still have the old one).",
    ],
    cmds: [
      "curl -s localhost:8888/payment-service/default",
      "git -C <config-repo> log -p -3 -- payment-service.yml",
    ],
    mitigate: [
      "Revert the config commit and restart or refresh the instances.",
      "Identify the orders rejected during the window and offer customers a retry (the saga compensated correctly, so there are no stuck reservations).",
    ],
    fix: [
      "Review config changes through pull requests with validation (schema, sane ranges), like code.",
      "Roll out config to one instance first (canary) and watch decline rate before the rest.",
      "Log every config change together with deployments so the cause is found in minutes.",
    ],
  }));

  c.push(...incident(5, "401 storm after JWT key rotation", "inc5.png", {
    sev: "SEV-2", impact: "All authenticated traffic is rejected; backend services see no requests.", pattern: "Access token, API gateway",
    scenario: "Security rotates the JWT signing secret. The token issuer starts signing with the new key while the gateway still validates with the old one (or the reverse). Every request returns 401 although users are logged in.",
    detect: [
      "Gateway 401 rate jumps to nearly 100% while backend request rate drops to zero.",
      "Gateway log: JWT signature validation failures.",
    ],
    diagnose: [
      "Did `JWT_SECRET` (or the JWKS content) change on one side only? Decode a token header and compare the key id and algorithm.",
      "Check expiry and clock skew between issuer and gateway if only some tokens fail.",
    ],
    mitigate: [
      "Restore the previous key on the side that changed (fastest) or make the gateway accept both keys for a while.",
      "Ask clients to log in again if tokens were signed with a key that is no longer trusted.",
    ],
    fix: [
      "Use asymmetric keys with a JWKS endpoint and `kid`: publish the new key before signing with it, keep the old key until old tokens expire.",
      "Rotation runbook, a canary check that logs in and calls an API after every rotation, and monitoring of 401 rate.",
    ],
  }));

  c.push(...incident(6, "Database connection pool exhausted", "inc6.png", {
    sev: "SEV-2", impact: "Requests wait and time out; messages are processed slowly.", pattern: "Transactions, Database per service",
    scenario: "A new feature calls an external REST service inside a `@Transactional` method. When that service slows down, transactions stay open, the Hikari pool of 10 connections is used up, and every other request waits for a connection.",
    detect: [
      "Errors: \"Connection is not available, request timed out\"; latency up while CPU is low.",
      "Metrics `hikaricp.connections.active` at max and `hikaricp.connections.pending` greater than zero.",
    ],
    diagnose: [
      "Thread dump: many threads inside the same service method holding a connection while waiting for I/O.",
      "Database side: long-running or idle-in-transaction sessions, missing index on a hot query.",
    ],
    cmds: [
      "curl -s localhost:8081/actuator/metrics/hikaricp.connections.pending",
      "select * from pg_stat_activity where state like 'idle in transaction%';   -- PostgreSQL",
    ],
    mitigate: [
      "Restart the worst instances to release connections; kill the long sessions.",
      "Temporarily raise the pool size only if the database can take it - this hides the cause and can move the problem to the database.",
    ],
    fix: [
      "Keep transactions short: no REST calls, no Kafka sends, no file I/O inside them (use the outbox for messages).",
      "Query and transaction timeouts, correct indexes, and a pool size derived from database capacity divided by instance count.",
      "Alert on pending connections before the pool is empty.",
    ],
  }));

  c.push(...incident(7, "Kafka consumer lag keeps growing", "inc7.png", {
    sev: "SEV-3 to SEV-2", impact: "Read model and notifications are minutes behind; downstream saga steps are delayed.", pattern: "Messaging, CQRS, Domain events",
    scenario: "After a marketing campaign order volume triples. The projector in order-query-service processes each event in 20 ms and cannot keep up; queries show old statuses and notification e-mails arrive late. A poison message also causes repeated retries on one partition.",
    detect: [
      "Lag alert per consumer group and topic; \"data freshness\" metric of the read model.",
      "Growing end-to-end time between OrderCreated and its appearance in the query API.",
    ],
    diagnose: [
      "Describe the consumer group: is lag on all partitions or one? One partition suggests a stuck or poison message or a hot key.",
      "Measure processing time per record and look for repeated rebalances (max.poll.interval exceeded).",
    ],
    cmds: [
      "kafka-consumer-groups.sh --bootstrap-server <host:port> --describe --group order-query-service",
      "kafka-topics.sh --bootstrap-server <host:port> --describe --topic order-events",
    ],
    mitigate: [
      "Add consumer instances (no more useful than the number of partitions).",
      "Send the poison message to a dead-letter topic and let the partition continue.",
      "Increase `max.poll.interval.ms` or reduce `max.poll.records` if rebalances are the cause.",
    ],
    fix: [
      "Create the topic with enough partitions keyed by orderId so consumers can scale; batch database writes in the projector.",
      "Dead-letter topic and error handler with backoff; autoscale consumers on lag.",
      "Define a freshness SLO for read models and test with load.",
    ],
  }));

  c.push(...incident(8, "A release breaks every authenticated gateway route", "inc8.png", {
    sev: "SEV-1", impact: "All API calls through the gateway return HTTP 500 right after the release; login still works.", pattern: "API gateway, Release management",
    scenario: "This happened while running this project. A filter that adds `X-Correlation-Id` tried to write a header on the incoming request headers, which are read-only in this Spring version, and threw `UnsupportedOperationException` on every routed request. The build and unit tests were green because nothing tested the gateway end to end.",
    detect: [
      "5xx rate 100% for routed paths immediately after deployment; `/auth/token` and `/actuator/health` still succeed.",
      "Synthetic check (login, then GET an order) fails.",
    ],
    diagnose: [
      "Gateway log shows `ReadOnlyHttpHeaders.put` / `set` with the stack pointing to the new filter class and line.",
      "Diff of the release confirms the only gateway change.",
    ],
    mitigate: [
      "Roll back to the previous image (fastest) or disable the filter with a feature flag.",
      "Communicate recovery and confirm with the synthetic check.",
    ],
    fix: [
      "Copy the headers to a writable `HttpHeaders` and decorate the request (fixed in `CorrelationIdGlobalFilter`); add the response header in `beforeCommit`.",
      "Add an integration test that sends a request through the gateway to a stub backend and asserts the status and header.",
      "Canary releases with automatic rollback on error rate; post-deploy smoke tests in the pipeline.",
    ],
    note: "**Lesson.** Green unit tests do not prove that cross-cutting infrastructure works. Test the gateway path, test with a dependency down, and make rollback a one-click action.",
  }));

  c.push(h2("Incident handling cheat sheet"));
  c.push(table(["Symptom", "First place to look", "Typical first action"], [
    ["Orders stay PENDING", "`saga_instance` state, unsent `outbox_event`, consumer lag", "Restore Kafka connectivity or restart the stuck consumer"],
    ["Duplicate side effects", "`processed_message`, messageId headers, rebalances", "Pause consumer, refund, verify dedupe in same transaction"],
    ["5xx / timeouts across services", "Zipkin slow span, breaker state, thread dump", "Fail fast, roll back, scale the slow dependency"],
    ["Business rule suddenly different", "Config server value and its git history", "Revert the config commit and refresh"],
    ["All requests 401", "JWT secret or JWKS on issuer vs gateway", "Restore previous key or accept both"],
    ["Latency high, CPU low", "Hikari pending connections, transactions with remote calls", "Restart worst instances, shorten transactions"],
    ["Read model or e-mails late", "Consumer group lag per partition", "Scale consumers, dead-letter the poison message"],
    ["Errors right after a release", "Diff, logs with stack trace, error rate by version", "Roll back first, analyse second"],
  ], [2700, 3700, 3346]));

  return c;
};
