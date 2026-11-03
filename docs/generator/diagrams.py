import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
os.makedirs(OUT, exist_ok=True)
NL = chr(10)

C = dict(blue="#DCEBFA", green="#DDF2E3", orange="#FDE9CF", red="#F9D9D6", purple="#E7DFF5",
         grey="#EEF0F2", yellow="#FFF6C9", line="#34495E", text="#1B2631")


def canvas(w, h):
    """w, h in inches; coordinate system is 10 units per inch."""
    fig, ax = plt.subplots(figsize=(w, h), dpi=200)
    ax.set_xlim(0, w * 10)
    ax.set_ylim(0, h * 10)
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, text, color="blue", fs=8.5, bold=False):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3,rounding_size=1.0", fc=C[color], ec=C["line"], lw=1.0)
    ax.add_patch(p)
    if text:
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs, color=C["text"],
                fontweight="bold" if bold else "normal", linespacing=1.3)


def arrow(ax, x1, y1, x2, y2, label=None, dashed=False, fs=7.5, lpos=0.5, dx=0, dy=0.8, curve=0.0):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=10, lw=1.1, color=C["line"],
                        linestyle="--" if dashed else "-", connectionstyle="arc3,rad=" + str(curve))
    ax.add_patch(a)
    if label:
        ax.text(x1 + (x2 - x1) * lpos + dx, y1 + (y2 - y1) * lpos + dy, label, ha="center", va="bottom",
                fontsize=fs, color=C["text"], bbox=dict(fc="white", ec="none", pad=0.5, alpha=0.9))


def title(ax, w, h, text):
    ax.text(w * 5, h * 10 - 1.0, text, ha="center", va="top", fontsize=10.5, fontweight="bold", color=C["text"])


def save(fig, name):
    fig.savefig(os.path.join(OUT, name), bbox_inches="tight", facecolor="white", pad_inches=0.08)
    plt.close(fig)


def sequence(name, ttl, parts, msgs, w=8.0, step=4.6):
    n = len(parts)
    h = (17 + step * (len(msgs) + 0.5)) / 10
    fig, ax = canvas(w, h)
    title(ax, w, h, ttl)
    top = h * 10 - 6
    xs = [w * 10 * (i + 0.5) / n for i in range(n)]
    bw = w * 10 / n - 2.5
    for x, (label, col) in zip(xs, parts):
        box(ax, x - bw / 2, top - 4.5, bw, 5.2, label, col, fs=7.8, bold=True)
        ax.plot([x, x], [top - 5, 2], color="#9AA5B1", lw=0.8, ls=(0, (4, 3)))
    y = top - 10
    for m in msgs:
        if m[0] == "note":
            ax.text(w * 5, y, m[1], ha="center", va="center", fontsize=7.8, style="italic", color="#7B241C",
                    bbox=dict(fc=C["yellow"], ec="#C9B458", pad=0.8, boxstyle="round"))
        else:
            f, t, label = m[0], m[1], m[2]
            dashed = len(m) > 3 and m[3]
            arrow(ax, xs[f], y, xs[t], y, label, dashed=dashed, fs=7.4, dy=0.5)
        y -= step
    save(fig, name)


def architecture():
    w, h = 8.2, 6.4
    fig, ax = canvas(w, h)
    title(ax, w, h, "System architecture")
    box(ax, 2, 50, 14, 7, "Client" + NL + "web / mobile", "grey", bold=True)
    box(ax, 21, 48, 34, 11, NL.join(["api-gateway :8080", "JWT check, routing,", "circuit breaker, correlation id"]), "orange", bold=True)
    box(ax, 62, 52, 18, 7, NL.join(["discovery-server", "Eureka :8761"]), "purple")
    box(ax, 62, 42, 18, 7, NL.join(["config-server", ":8888"]), "purple")
    box(ax, 2, 27, 22, 9, NL.join(["order-service :8081", "Order aggregate", "Saga orchestrator"]), "blue", bold=True)
    box(ax, 29, 25, 24, 13, NL.join(["Apache Kafka", "order-events", "inventory-commands", "payment-commands", "order-saga-replies"]), "yellow", bold=True, fs=7.8)
    box(ax, 58, 27, 22, 9, NL.join(["order-query-service", ":8085  CQRS read model", "API composition"]), "blue", bold=True, fs=8)
    box(ax, 2, 6, 22, 9, NL.join(["inventory-service", ":8082  stock"]), "green")
    box(ax, 29, 6, 24, 9, NL.join(["payment-service", ":8083  credit limit"]), "green")
    box(ax, 58, 6, 22, 9, NL.join(["notification-service", ":8084  subscriber"]), "green")
    arrow(ax, 16, 53.5, 21, 53.5, "JWT", dy=0.6)
    arrow(ax, 28, 48, 14, 36, "lb://", dx=-2, dy=0)
    arrow(ax, 48, 48, 66, 36, "lb://", dx=3, dy=0)
    arrow(ax, 24, 33, 29, 33, "")
    arrow(ax, 29, 29, 24, 29, "", dashed=True)
    arrow(ax, 53, 32, 58, 32, "events")
    arrow(ax, 35, 25, 18, 15, "cmd", dx=-1, dy=0)
    arrow(ax, 41, 25, 41, 15, "cmd", dx=3, dy=0)
    arrow(ax, 49, 25, 66, 15, "events", dx=3, dy=0)
    arrow(ax, 62, 55, 55, 55, "", dashed=True)
    arrow(ax, 62, 45, 55, 50, "", dashed=True)
    ax.text(41, 1, "Each service owns its database. Replies travel back to the orchestrator over Kafka (dashed).",
            ha="center", fontsize=7.2, style="italic", color="#566573")
    save(fig, "architecture.png")


def saga_happy():
    parts = [("Client", "grey"), ("order-service" + NL + "orchestrator", "blue"), ("Kafka", "yellow"),
             ("inventory", "green"), ("payment", "green"), ("notify /" + NL + "query", "purple")]
    msgs = [
        (0, 1, "POST /orders"),
        ("note", "1  one local tx: Order PENDING + saga + outbox rows"),
        (1, 0, "202 Accepted", True),
        (1, 2, "OrderCreated, ReserveStock"),
        (2, 3, "ReserveStock"),
        ("note", "2  stock reduced, reply written to outbox"),
        (3, 2, "reply: stock reserved"),
        (2, 1, "reply"),
        ("note", "3  saga PROCESSING_PAYMENT"),
        (1, 2, "ProcessPayment"),
        (2, 4, "ProcessPayment"),
        ("note", "4  payment CAPTURED (within credit limit)"),
        (4, 2, "reply: payment ok"),
        (2, 1, "reply"),
        ("note", "5  Order APPROVED, saga COMPLETED"),
        (1, 2, "OrderApproved"),
        (2, 5, "OrderApproved"),
    ]
    sequence("saga_happy.png", "Create-order saga - happy path", parts, msgs)


def saga_comp():
    parts = [("order-service" + NL + "orchestrator", "blue"), ("Kafka", "yellow"), ("inventory", "green"), ("payment", "green")]
    msgs = [
        ("note", "Order PENDING, stock already reserved"),
        (0, 1, "ProcessPayment (1500)"),
        (1, 3, "ProcessPayment"),
        ("note", "limit is 1000 -> payment DECLINED"),
        (3, 1, "reply: failed, limit exceeded"),
        (1, 0, "reply"),
        ("note", "saga RELEASING_STOCK (compensation)"),
        (0, 1, "ReleaseStock"),
        (1, 2, "ReleaseStock"),
        ("note", "stock restored, reservation released"),
        (2, 1, "reply: released"),
        (1, 0, "reply"),
        ("note", "Order REJECTED + OrderRejected event"),
    ]
    sequence("saga_comp.png", "Saga compensation - payment fails", parts, msgs)


def outbox():
    w, h = 8.0, 7.6
    fig, ax = canvas(w, h)
    title(ax, w, h, "Transactional outbox, polling publisher, idempotent consumer")
    box(ax, 2, 52, 76, 17, "", "blue")
    ax.text(40, 66, "Producer service - ONE database transaction", ha="center", fontsize=8.5, fontweight="bold")
    box(ax, 6, 55, 30, 8, NL.join(["business tables", "orders, saga_instance"]), "grey")
    box(ax, 44, 55, 30, 8, NL.join(["outbox_event", "row with sent = false"]), "orange")
    arrow(ax, 36, 59, 44, 59, "same commit")
    box(ax, 22, 34, 36, 10, NL.join(["OutboxPublisher", "polls every 500 ms, send, then sent = true"]), "purple", fs=8)
    arrow(ax, 59, 55, 45, 44, "poll", dx=4, dy=0)
    box(ax, 22, 18, 36, 8, NL.join(["Kafka topic", "at-least-once delivery"]), "yellow", bold=True)
    arrow(ax, 40, 34, 40, 26, "send", dx=4, dy=0)
    box(ax, 2, 1, 76, 11, "", "green")
    ax.text(40, 9.3, "Consumer service - ONE database transaction", ha="center", fontsize=8.5, fontweight="bold")
    box(ax, 6, 2.5, 30, 5, "id in processed_message? skip", "grey", fs=7.6)
    box(ax, 44, 2.5, 30, 5, "else: insert id + business update", "green", fs=7.6)
    arrow(ax, 36, 5, 44, 5, "")
    arrow(ax, 40, 18, 40, 12, "deliver", dx=4, dy=0)
    save(fig, "outbox.png")


def cqrs():
    w, h = 8.0, 4.6
    fig, ax = canvas(w, h)
    title(ax, w, h, "Domain events and CQRS")
    box(ax, 2, 24, 20, 11, NL.join(["Command side", "order-service", "POST /orders"]), "blue", bold=True)
    box(ax, 2, 6, 20, 8, NL.join(["orders table", "write model"]), "grey")
    box(ax, 30, 16, 22, 20, NL.join(["Kafka", "order-events", "", "OrderCreated", "OrderApproved", "OrderRejected"]), "yellow", bold=True, fs=8)
    box(ax, 58, 26, 20, 11, NL.join(["order-query-service", "projector ->", "order_summary"]), "green", bold=True, fs=8)
    box(ax, 58, 8, 20, 10, NL.join(["notification-service", "send e-mail / SMS"]), "purple", fs=8)
    arrow(ax, 12, 24, 12, 14, "save", dx=3, dy=0)
    arrow(ax, 22, 30, 30, 28, "outbox", dy=0.8)
    arrow(ax, 52, 30, 58, 31, "")
    arrow(ax, 52, 22, 58, 14, "")
    ax.text(68, 22, "GET /query/orders", ha="center", fontsize=7.4, style="italic")
    save(fig, "cqrs.png")


def gateway():
    w, h = 8.0, 6.4
    fig, ax = canvas(w, h)
    title(ax, w, h, "API gateway request path")
    box(ax, 1, 28, 12, 8, "Client", "grey", bold=True)
    box(ax, 18, 6, 34, 52, "", "orange")
    ax.text(35, 55, "api-gateway", ha="center", fontsize=9, fontweight="bold")
    steps = ["1  validate JWT (401 if bad)", "2  add X-Correlation-Id", "3  match route /api/orders/**", "4  circuit breaker + fallback", "5  lb://order-service"]
    for i, s in enumerate(steps):
        box(ax, 21, 46 - i * 8.6, 28, 6, s, "orange", fs=7.6)
    arrow(ax, 13, 32, 18, 32, "Bearer" + NL + "JWT", dy=1.2)
    box(ax, 62, 42, 17, 10, NL.join(["Eureka", "registry"]), "purple", bold=True)
    box(ax, 62, 10, 17, 8, "order-service A", "blue", bold=True)
    box(ax, 62, 21, 17, 8, "order-service B", "blue", bold=True)
    arrow(ax, 52, 11, 62, 14, "")
    arrow(ax, 52, 15, 62, 25, "")
    arrow(ax, 52, 22, 62, 44, "lookup", dashed=True, dx=-1, dy=0)
    save(fig, "gateway.png")


def discovery():
    w, h = 8.0, 4.8
    fig, ax = canvas(w, h)
    title(ax, w, h, "Startup: configuration, registration and discovery")
    box(ax, 2, 20, 20, 10, NL.join(["payment-service", "starting"]), "green", bold=True)
    box(ax, 30, 32, 24, 10, NL.join(["config-server", "credit-limit: 1000"]), "purple")
    box(ax, 30, 6, 24, 10, NL.join(["discovery-server", "Eureka registry"]), "purple")
    box(ax, 58, 20, 20, 10, NL.join(["order-query-service", "caller"]), "blue", bold=True)
    arrow(ax, 20, 30, 30, 36, "1", dx=-1, dy=0.6)
    arrow(ax, 20, 20, 30, 12, "2", dx=-1, dy=-2.5)
    arrow(ax, 58, 22, 54, 14, "3", dx=3, dy=-2.5)
    arrow(ax, 58, 26, 22, 26, "4", dy=0.8)
    ax.text(40, 1.5, "1 fetch config   2 register + heartbeat   3 fetch registry   4 call http://payment-service/... (load balanced)",
            ha="center", fontsize=7.2, style="italic", color="#566573")
    save(fig, "discovery.png")


def breaker():
    w, h = 8.2, 4.2
    fig, ax = canvas(w, h)
    title(ax, w, h, "Circuit breaker states (Resilience4j)")
    box(ax, 2, 18, 21, 12, NL.join(["CLOSED", "calls pass,", "failures counted"]), "green", bold=True)
    box(ax, 30, 18, 21, 12, NL.join(["OPEN", "calls rejected,", "fallback returned"]), "red", bold=True)
    box(ax, 58, 18, 21, 12, NL.join(["HALF-OPEN", "few trial calls"]), "yellow", bold=True)
    arrow(ax, 23, 26, 30, 26, "50% fail", dy=0.8, fs=7)
    arrow(ax, 51, 26, 58, 26, "after 10 s", dy=0.8, fs=7)
    arrow(ax, 68, 18, 12, 18, "trial calls succeed -> CLOSED", dy=-7, curve=-0.28)
    arrow(ax, 72, 30, 44, 30, "trial fails -> OPEN", dy=3.5, curve=0.3, dashed=True)
    save(fig, "breaker.png")


def observability():
    w, h = 8.0, 4.8
    fig, ax = canvas(w, h)
    title(ax, w, h, "Observability signals")
    box(ax, 2, 16, 16, 14, NL.join(["Every", "service", "(chassis)"]), "blue", bold=True)
    items = [("/actuator/health" + NL + "health check API", "green", 33), ("/actuator/prometheus" + NL + "application metrics", "orange", 24),
             ("Zipkin spans" + NL + "distributed tracing", "purple", 15), ("logs: traceId + cid, AUDIT" + NL + "log aggregation", "yellow", 6)]
    for text, col, y in items:
        box(ax, 25, y, 31, 7, text, col, fs=7.6)
        arrow(ax, 18, 23, 25, y + 3.5, "")
        arrow(ax, 56, y + 3.5, 63, 23, "")
    box(ax, 63, 16, 15, 14, NL.join(["Prometheus", "Grafana", "ELK, Zipkin"]), "grey", bold=True, fs=8)
    save(fig, "observability.png")


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        if len(cur) + len(wd) + 1 > width:
            lines.append(cur)
            cur = wd
        else:
            cur = (cur + " " + wd).strip()
    lines.append(cur)
    return NL.join(lines)


def triage(name, ttl, stages):
    w, h = 8.0, 5.4
    fig, ax = canvas(w, h)
    title(ax, w, h, ttl)
    pw, ph, gap = 37, 21, 3
    for i, (head, bullets, col) in enumerate(stages):
        cx = 1.5 + (i % 2) * (pw + gap)
        cy = 27 - (i // 2) * (ph + 2.5)
        box(ax, cx, cy + ph - 4.5, pw, 4.5, str(i + 1) + "  " + head, col, fs=9, bold=True)
        ax.add_patch(FancyBboxPatch((cx, cy), pw, ph - 6.2, boxstyle="round,pad=0.3,rounding_size=1.0", fc="white", ec="#B2BABB", lw=0.9))
        yy = cy + ph - 8.0
        for b in bullets:
            wrapped = wrap(b, 52)
            ax.text(cx + 1.2, yy, "- " + wrapped.replace(NL, NL + "  "), fontsize=7.8, va="top", color=C["text"], linespacing=1.25)
            yy -= 1.55 * (wrapped.count(NL) + 1) + 1.0
    save(fig, name)


def incidents():
    triage("inc1.png", "Incident 1 - Orders stuck in PENDING", [
        ("DETECT", ["Alert: orders PENDING longer than 5 min", "Query service shows no final status", "Outbox relay warnings in the log"], "red"),
        ("DIAGNOSE", ["Which saga state? (saga_instance)", "outbox_event sent=false growing?", "Consumer group lag per topic", "Follow the correlation id in the logs"], "orange"),
        ("MITIGATE", ["Fix Kafka reachability / bootstrap address", "Restart or scale the stuck consumer", "Move poison message to a dead-letter topic"], "yellow"),
        ("FIX AND PREVENT", ["Saga timeout watchdog", "Dead-letter topic with backoff", "Alert on oldest unsent outbox row"], "green"),
    ])
    triage("inc2.png", "Incident 2 - Customer charged twice", [
        ("DETECT", ["Support ticket or reconciliation diff", "Two PAYMENT_CAPTURED audit lines for one order"], "red"),
        ("DIAGNOSE", ["Same messageId delivered twice?", "processed_message row present?", "Rebalance during processing?", "Or two commands from the producer?"], "orange"),
        ("MITIGATE", ["Refund the extra charge", "Pause the consumer if still looping", "Reconcile the incident window"], "yellow"),
        ("FIX AND PREVENT", ["Dedupe id in the same transaction", "Unique key on the business id", "Idempotency key for the payment provider"], "green"),
    ])
    triage("inc3.png", "Incident 3 - Slow dependency, cascading failure", [
        ("DETECT", ["Gateway 503 and latency alerts", "Thread / connection pools saturated", "Circuit breaker state OPEN"], "red"),
        ("DIAGNOSE", ["Zipkin: which span is slow", "Thread dump of the caller", "What changed: deploy, config, traffic"], "orange"),
        ("MITIGATE", ["Let breakers serve fallbacks", "Roll back or scale out the slow service", "Shed load at the gateway"], "yellow"),
        ("FIX AND PREVENT", ["Timeouts on every call, aligned by layer", "Bulkheads, limited retries", "Load test with a dependency down"], "green"),
    ])
    triage("inc4.png", "Incident 4 - Wrong config pushed", [
        ("DETECT", ["Spike in declined payments", "Config repository changed just before"], "red"),
        ("DIAGNOSE", ["Ask config-server what the service gets", "Compare with the last good commit", "Which instances reloaded it?"], "orange"),
        ("MITIGATE", ["Revert the config commit", "Refresh or restart instances", "Offer retries for rejected orders"], "yellow"),
        ("FIX AND PREVENT", ["Pull request review and validation", "Canary a config change", "Log config changes with deployments"], "green"),
    ])
    triage("inc5.png", "Incident 5 - 401 storm after key rotation", [
        ("DETECT", ["Gateway 401 rate near 100%", "No traffic reaches the backends"], "red"),
        ("DIAGNOSE", ["Did JWT_SECRET or JWKS change on one side?", "Compare key id and algorithm in a token", "Expiry and clock skew"], "orange"),
        ("MITIGATE", ["Restore the previous key", "Accept old and new keys for a while", "Ask clients to log in again"], "yellow"),
        ("FIX AND PREVENT", ["JWKS with key ids (kid)", "Overlap period during rotation", "Rotation runbook and canary login check"], "green"),
    ])
    triage("inc6.png", "Incident 6 - DB connection pool exhausted", [
        ("DETECT", ["Connection not available errors", "Latency up while CPU is low", "hikaricp pending connections > 0"], "red"),
        ("DIAGNOSE", ["Thread dump: who holds connections", "Slow query log, missing index", "Remote call inside @Transactional?"], "orange"),
        ("MITIGATE", ["Restart the worst instances", "Kill long running sessions", "Raise the pool size only temporarily"], "yellow"),
        ("FIX AND PREVENT", ["Short transactions, no remote calls inside", "Query timeouts and indexes", "Pool sized from database capacity"], "green"),
    ])
    triage("inc7.png", "Incident 7 - Kafka consumer lag grows", [
        ("DETECT", ["Lag alert on order-events", "Read model minutes behind"], "red"),
        ("DIAGNOSE", ["kafka-consumer-groups --describe", "Lag on all partitions or only one?", "Time per message, repeated rebalances", "Poison message retried forever?"], "orange"),
        ("MITIGATE", ["Scale consumers (up to partition count)", "Dead-letter the poison message", "Tune max.poll settings"], "yellow"),
        ("FIX AND PREVENT", ["More partitions keyed by orderId", "Batch heavy work", "Autoscale on lag, freshness SLO"], "green"),
    ])
    triage("inc8.png", "Incident 8 - Release breaks all gateway routes (500)", [
        ("DETECT", ["5xx at 100% right after deploy", "Login works, /api/** returns 500", "Smoke test fails"], "red"),
        ("DIAGNOSE", ["Gateway log: UnsupportedOperationException", "Stack points to the new filter", "Release diff: header write"], "orange"),
        ("MITIGATE", ["Roll back to the previous image", "Or switch the filter off by flag"], "yellow"),
        ("FIX AND PREVENT", ["Write on a copy of the headers", "Integration test through the gateway", "Canary release, automatic rollback"], "green"),
    ])


architecture(); saga_happy(); saga_comp(); outbox(); cqrs(); gateway(); discovery(); breaker(); observability(); incidents()
print(len(os.listdir(OUT)))
