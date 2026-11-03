"""Per-pattern 'which services take part' diagrams. Run: python pattern_maps.py (uses helpers from diagrams.py)."""
import matplotlib
matplotlib.use("Agg")
from matplotlib.patches import FancyArrowPatch
import diagrams as d

W = 8.0  # inches; 10 units per inch, keep x + width <= 79
SVC, STORE, INFRA, SERVER, CLIENT, LIB = "blue", "green", "orange", "purple", "yellow", "grey"


def clip(c, half, other):
    """Point on the border of the box centred at c towards 'other'."""
    dx, dy = other[0] - c[0], other[1] - c[1]
    if dx == 0 and dy == 0:
        return c
    t = min(half[0] / abs(dx) if dx else 1e9, half[1] / abs(dy) if dy else 1e9)
    return (c[0] + dx * t, c[1] + dy * t)


def pmap(name, ttl, nodes, edges, h=3.0, note=None):
    fig, ax = d.canvas(W, h)
    d.title(ax, W, h, ttl)
    pos = {}
    for nid, label, x, y, w, col in nodes:
        bh = 6.2
        d.box(ax, x, y, w, bh, label, col, fs=7.6, bold=True)
        pos[nid] = ((x + w / 2, y + bh / 2), (w / 2 + 0.6, bh / 2 + 0.6))
    for e in edges:
        a, b, label = e[0], e[1], e[2]
        dashed = len(e) > 3 and e[3]
        (ca, ha), (cb, hb) = pos[a], pos[b]
        p1, p2 = clip(ca, ha, cb), clip(cb, hb, ca)
        ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=10, lw=1.1, color=d.C["line"],
                                     linestyle="--" if dashed else "-"))
        if label:
            ax.text((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + 0.4, label, ha="center", va="bottom", fontsize=6.9,
                    color=d.C["text"], bbox=dict(fc="white", ec="none", pad=0.4, alpha=0.9))
    if note:
        ax.text(W * 5, 0.6, note, ha="center", va="bottom", fontsize=7.2, style="italic", color="#7B241C")
    d.save(fig, name)


pmap("pm_dbps.png", "Database per service", [
    ("o", "order-service", 1, 17, 14, SVC), ("i", "inventory-service", 16, 17, 15, SVC),
    ("p", "payment-service", 32, 17, 14, SVC), ("n", "notification-service", 47, 17, 16, SVC),
    ("q", "order-query-service", 64, 17, 15, SVC),
    ("od", "orderdb", 3, 7, 10, STORE), ("id", "inventorydb", 18, 7, 11, STORE), ("pd", "paymentdb", 34, 7, 10, STORE),
    ("nd", "notificationdb", 49, 7, 12, STORE), ("qd", "querydb", 67, 7, 10, STORE),
], [("o", "od", ""), ("i", "id", ""), ("p", "pd", ""), ("n", "nd", ""), ("q", "qd", "")],
    note="No service reads another service's tables; data is shared only through APIs and events.")

pmap("pm_saga.png", "Saga (orchestration) and compensation", [
    ("c", "Client", 1, 15, 9, CLIENT), ("o", "order-service\n(orchestrator)", 15, 14, 17, SVC),
    ("k", "Kafka\ncommands + replies", 40, 14, 18, INFRA),
    ("i", "inventory-service\nreserve / release", 62, 23, 17, SVC), ("p", "payment-service\ncapture", 62, 5, 17, SVC),
], [("c", "o", "POST /orders"), ("o", "k", "commands"), ("k", "i", "ReserveStock"), ("k", "p", "ProcessPayment")],
    h=3.6, note="Both services reply on the saga-replies topic; order-service then moves on or compensates.")

pmap("pm_outbox.png", "Transactional outbox and polling publisher", [
    ("s", "order / inventory /\npayment service", 1, 15, 19, SVC), ("t", "business table\n+ outbox_event\n(one transaction)", 26, 15, 19, STORE),
    ("pub", "OutboxPublisher\n(@Scheduled poll)", 51, 15, 17, LIB), ("k", "Kafka", 72, 15, 7, INFRA),
], [("s", "t", "save"), ("t", "pub", "unsent rows"), ("pub", "k", "send, mark")],
    note="The publisher lives in the common module, so every service that sends messages gets it.")

pmap("pm_idem.png", "Idempotent consumer", [
    ("k", "Kafka\n(at-least-once)", 1, 17, 16, INFRA), ("l", "command / event listener\nin each consumer", 25, 17, 22, SVC),
    ("ic", "IdempotentConsumer\n(common)", 55, 22, 20, LIB), ("pm", "processed_message\n+ business change\n(same transaction)", 55, 6, 20, STORE),
], [("k", "l", "messageId"), ("l", "ic", "run once?"), ("ic", "pm", "insert id + apply")],
    h=3.6, note="Used by inventory, payment, order (replies), notification and order-query listeners.")

pmap("pm_cqrs.png", "CQRS and domain events", [
    ("c", "Client", 1, 13, 9, CLIENT), ("o", "order-service\n(command side)", 16, 24, 17, SVC),
    ("k", "Kafka\norder-events", 42, 24, 15, INFRA), ("q", "order-query-service\nOrderSummaryProjector", 59, 24, 20, SVC),
    ("qd", "querydb\norder_summary", 62, 6, 15, STORE), ("od", "orderdb", 19, 6, 11, STORE),
], [("c", "o", "write"), ("o", "od", ""), ("o", "k", "OrderEvent"), ("k", "q", ""), ("q", "qd", "update view"),
    ("c", "qd", "GET /query/orders", True)], h=3.6)

pmap("pm_compose.png", "API composition", [
    ("c", "Client", 1, 14, 9, CLIENT), ("q", "order-query-service\nOrderDetailsComposer", 16, 12, 22, SVC),
    ("o", "order-service", 58, 24, 16, SVC), ("p", "payment-service", 58, 14, 16, SVC), ("i", "inventory-service", 58, 4, 16, SVC),
], [("c", "q", "GET .../details"), ("q", "o", "order"), ("q", "p", "payment"), ("q", "i", "stock")], h=3.8,
    note="Calls use a load-balanced client; each call is wrapped in a circuit breaker.")

pmap("pm_gateway.png", "API gateway", [
    ("c", "Client / browser", 1, 16, 14, CLIENT), ("g", "api-gateway :8080\nroutes, JWT, filters", 24, 15, 20, SVC),
    ("o", "order-service", 58, 26, 16, SVC), ("i", "inventory-service", 58, 18, 16, SVC),
    ("p", "payment-service", 58, 10, 16, SVC), ("q", "order-query-service", 58, 2, 16, SVC),
], [("c", "g", "/api/**"), ("g", "o", ""), ("g", "i", ""), ("g", "p", ""), ("g", "q", "")], h=4.0)

pmap("pm_token.png", "Access token (JWT)", [
    ("c", "Client", 1, 15, 9, CLIENT), ("t", "api-gateway\nPOST /auth/token", 26, 24, 19, SVC),
    ("v", "api-gateway\nvalidates Bearer token", 26, 7, 21, SVC), ("s", "downstream services\n(trust the gateway)", 58, 7, 21, SVC),
], [("c", "t", "login, gets JWT"), ("c", "v", "Bearer JWT"), ("v", "s", "forward")], h=3.8,
    note="Demo issuer only. In production use an identity provider and validate with its public keys.")

pmap("pm_breaker.png", "Circuit breaker", [
    ("g", "api-gateway\nCircuitBreaker filter", 1, 24, 20, SVC), ("f", "FallbackController\n/fallback/{service}", 30, 24, 20, LIB),
    ("q", "order-query-service\nOrderDetailsComposer", 1, 8, 22, SVC), ("d", "payment / inventory\n(may be slow or down)", 52, 8, 22, SVC),
], [("g", "f", "open or timeout"), ("q", "d", "call guarded")], h=3.6,
    note="Gateway time limit 5 s; the composer returns partial data when a dependency is open.")

pmap("pm_discovery.png", "Service registry, self registration, client-side discovery", [
    ("r", "discovery-server\nEureka :8761", 30, 24, 20, SERVER), ("s", "every service\n(self registers)", 1, 8, 18, SVC),
    ("g", "api-gateway\nlb://order-service", 56, 8, 22, SVC),
], [("s", "r", "register + heartbeat"), ("g", "r", "fetch registry", True), ("g", "s", "pick instance, call")], h=3.6)

pmap("pm_config.png", "Externalized configuration", [
    ("cs", "config-server :8888", 28, 24, 20, SERVER), ("repo", "config-repo/\napplication.yml\npayment-service.yml", 56, 22, 22, STORE),
    ("s", "all services\n(config client)", 1, 8, 18, SVC), ("p", "payment-service\npayment.credit-limit", 40, 8, 22, SVC),
], [("s", "cs", "spring.config.import"), ("p", "cs", "limit = 1000", True), ("cs", "repo", "read")], h=3.6)

pmap("pm_chassis.png", "Microservice chassis", [
    ("c", "common module\nchassis.yml, filters, outbox,\nidempotency, error handler", 25, 22, 32, LIB),
    ("o", "order", 1, 6, 12, SVC), ("i", "inventory", 17, 6, 12, SVC), ("p", "payment", 33, 6, 12, SVC),
    ("n", "notification", 49, 6, 14, SVC), ("q", "order-query", 66, 6, 12, SVC),
], [("c", "o", ""), ("c", "i", ""), ("c", "p", ""), ("c", "n", ""), ("c", "q", "")], h=3.6)

pmap("pm_obs.png", "Observability", [
    ("s", "all services\n(chassis)", 1, 15, 16, SVC), ("h", "/actuator/health\n/metrics /prometheus", 30, 25, 24, LIB),
    ("z", "Zipkin :9411\ntraces", 30, 5, 18, SERVER), ("l", "logs with traceId\n+ X-Correlation-Id\n+ AuditLog", 57, 14, 21, LIB),
], [("s", "h", "health + metrics"), ("s", "z", "spans"), ("s", "l", "structured logs")], h=3.6)

pmap("pm_msg.png", "Messaging and remote procedure invocation", [
    ("o", "order-service", 1, 17, 14, SVC), ("k", "Kafka topics\ncommands, replies, order-events", 24, 17, 28, INFRA),
    ("n", "notification-service", 62, 24, 16, SVC), ("q", "order-query-service", 62, 10, 16, SVC),
    ("g", "api-gateway", 1, 3, 14, SVC),
], [("o", "k", "async messages"), ("k", "n", "events"), ("k", "q", "events"), ("g", "o", "REST (sync)")], h=3.8,
    note="Sync REST for requests from clients; async messaging between services for the saga and events.")

pmap("pm_chassis_yml.png", "chassis.yml and the chassis module", [
    ("y", "chassis.yml\nshared settings", 1, 24, 22, LIB), ("a", "ChassisAutoConfiguration\nfilters, outbox, topics", 40, 24, 30, LIB),
    ("s", "order, inventory, payment,\nnotification, order-query", 8, 7, 34, SVC),
    ("x", "own application.yml\nport, name, datasource", 54, 7, 25, STORE),
], [("y", "s", "classpath:chassis.yml"), ("a", "s", "auto-configuration"), ("x", "s", "overrides", True)], h=3.8,
    note="api-gateway, config-server and discovery-server do not use the chassis.")

pmap("pm_configrepo.png", "config-repo served by config-server", [
    ("a", "application.yml\nall clients", 1, 26, 18, STORE), ("b", "payment-service.yml\ncredit-limit: 1000", 1, 12, 18, STORE),
    ("cs", "config-server :8888\nnative profile", 29, 19, 20, SERVER),
    ("p", "payment-service\n@Value payment.credit-limit", 56, 26, 23, SVC), ("o", "other services\nshared values only", 56, 10, 23, SVC),
], [("a", "cs", "read"), ("b", "cs", "read"), ("cs", "p", "merged config"), ("cs", "o", "application.yml")], h=4.0,
    note="Services ask by name: GET /payment-service/default.")
