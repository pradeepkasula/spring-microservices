# Microservices Patterns - Spring Boot reference project

A runnable Spring Boot 3.3 / Spring Cloud 2023.0 system that implements the patterns from the
[microservices.io pattern language](https://microservices.io/patterns/index.html). Domain: **place an order**.

```
client ──JWT──> api-gateway :8080 ──lb://──> order-service :8081  ──(outbox → Kafka)──> inventory-service :8082
                    │                              ▲  ▲                                  payment-service   :8083
                    │                              │  └──── saga replies ───────────────────────┘
                    └──> order-query-service :8085 <── order-events ── notification-service :8084
discovery-server :8761 (Eureka)   config-server :8888   Kafka :9092   Zipkin :9411
```

| Module | Role |
|---|---|
| `common` | **Microservice chassis**: outbox, idempotent consumer, correlation id, error handling, audit log, shared defaults (`chassis.yml`) |
| `discovery-server` | Service registry (Eureka) |
| `config-server` | Externalized configuration |
| `api-gateway` | API gateway: routing, JWT check, circuit breaker, correlation id, BFF-style routes |
| `order-service` | Order aggregate + **saga orchestrator** |
| `inventory-service`, `payment-service` | Saga participants, each with its own database |
| `notification-service` | Pure domain-event subscriber |
| `order-query-service` | **CQRS** read model + **API composition** |

## Run it

```bash
mvn verify                       # builds everything and runs the tests (no Kafka needed)
docker compose up -d             # Kafka + Zipkin
```
Start, in this order (each in its own terminal): `discovery-server`, `config-server`, then the rest
(`mvn -pl <module> spring-boot:run`). Or run everything in containers: `docker compose --profile apps up -d --build`.

```bash
TOKEN=$(curl -s -X POST localhost:8080/auth/token -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo"}' | sed 's/.*"access_token":"\([^"]*\)".*/\1/')

# happy path: stock reserved, payment captured, order APPROVED
curl -s -X POST localhost:8080/api/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"customerId":"c1","sku":"BOOK-1","quantity":2,"amount":40.00}'

# compensation: amount above the 1000 credit limit -> payment declined -> stock released -> order REJECTED
curl -s -X POST localhost:8080/api/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"customerId":"c1","sku":"LAPTOP-1","quantity":1,"amount":1500.00}'

curl -s "localhost:8080/api/query/orders?customerId=c1"         -H "Authorization: Bearer $TOKEN"   # CQRS read side
curl -s localhost:8080/api/query/orders/<id>/details            -H "Authorization: Bearer $TOKEN"   # API composition
curl -s localhost:8080/mobile/orders/<id>                       -H "Authorization: Bearer $TOKEN"   # BFF-style route
```
Stop `payment-service` and call `/details` again: the payment part answers `UNAVAILABLE` (circuit breaker) while the rest still works.

### Running without Docker

`mvn -pl local-kafka exec:java` starts a single-node Kafka inside one JVM and prints `LOCAL KAFKA READY on localhost:<port>`.
Start `discovery-server` and `config-server`, then every other jar with `KAFKA_BOOTSTRAP=localhost:<port>` (and `SERVER_PORT=8090`
for the gateway if 8080 is busy). Use a JDK 17 `java`. See `docs/Microservices-Patterns-Guide.docx` for the full guide,
flow diagrams, interview questions and incident playbook.

## Pattern-by-pattern guide

"Implemented" = there is code you can read and run. "Documented" = it is a deployment/organisational
choice, so the table says how this project reflects it and what you would do in production.

### Architectural style
| Pattern | Status | Explanation |
|---|---|---|
| Monolithic architecture | Documented | The baseline this project moves away from: one deployable, one database. Fine for small teams, but every change redeploys everything. |
| Microservice architecture | Implemented | The whole repo: independently deployable services, each owning its data, collaborating over REST and Kafka. |

### Service boundaries
| Pattern | Status | Explanation |
|---|---|---|
| Decompose by business capability | Implemented | Services map to what the business does: ordering, inventory, payment, notification. |
| Decompose by subdomain | Implemented | Order, Inventory and Payment are DDD subdomains with their own model of "an order" (e.g. `OrderSummary` vs `Order`). |
| Self-contained service | Implemented | A service answers requests without synchronous calls to others: orders are accepted (202) and the saga finishes asynchronously; reads come from the local read model. |
| Service per team | Documented | One team owns one or two modules end to end (code, DB, pipeline, on-call). Module boundaries here are the seams for that. |

### Refactoring to services
| Pattern | Status | Explanation |
|---|---|---|
| Strangler application | Documented | Put the gateway in front of the monolith and add a route per extracted capability (`lb://order-service` replaces `http://monolith/orders`), shrinking the monolith route by route. |
| Anti-corruption layer | Documented | When a new service must talk to a legacy model, translate at the edge (an adapter class), so legacy concepts do not leak into the new domain. `MessageReader` plus the contract records play this role for messages. |

### Service collaboration / data management
| Pattern | Status | Explanation |
|---|---|---|
| Database per service | Implemented | Each service has its own H2 database (`orderdb`, `inventorydb`, ...). No cross-service SQL. Swap for one PostgreSQL schema or instance per service in production. |
| Shared database | Not used (anti-pattern here) | Deliberately avoided: it couples schemas and releases. |
| Saga | Implemented | `CreateOrderSaga` (orchestration): reserve stock → charge payment → approve. On payment failure it runs the compensating `ReleaseStock`. State persists in `saga_instance`. |
| Command-side replica | Documented | An alternative to API composition: keep a local replica of data owned elsewhere (e.g. customer credit) updated from events. `OrderSummary` is the same idea applied to queries. |
| API composition | Implemented | `OrderDetailsComposer` joins order, payment and inventory data by calling their APIs. |
| CQRS | Implemented | Command side = `order-service`; query side = `order-query-service`, fed only by `order-events`. |
| Domain event | Implemented | `OrderCreated / OrderApproved / OrderRejected` published on `order-events`, consumed by notification and query services. |
| Event sourcing | Documented (not implemented) | Would store `OrderEvent`s as the source of truth and rebuild state by replay. This project stores current state plus events; adopt event sourcing when you need a full audit trail or temporal queries (Axon, Eventuate). |
| Aggregate (DDD) | Implemented | `Order` is the aggregate changed in one local transaction. |

### Transactional messaging
| Pattern | Status | Explanation |
|---|---|---|
| Transactional outbox | Implemented | `OutboxService.publish` (propagation `MANDATORY`) writes the message row in the same DB transaction as the business change, so state and message cannot diverge. |
| Polling publisher | Implemented | `OutboxPublisher` polls unsent rows every 500 ms and sends them to Kafka (at-least-once). |
| Transaction log tailing | Documented | The lower-latency alternative to polling: Debezium reads the DB log and publishes the outbox table. Replace `OutboxPublisher` with a Debezium connector; consumers do not change. |

### Communication styles
| Pattern | Status | Explanation |
|---|---|---|
| Remote procedure invocation | Implemented | REST: client → gateway → services, and the composer's calls. |
| Messaging | Implemented | Kafka topics for saga commands/replies and domain events. |
| Domain-specific protocol | Documented | Use when a domain has its own standard (SMTP, AMQP, FIX). Not needed here. |
| Idempotent consumer | Implemented | `IdempotentConsumer` records processed message ids in the same transaction, so redelivery changes nothing (see the contract test). |

### External API
| Pattern | Status | Explanation |
|---|---|---|
| API gateway | Implemented | `api-gateway`: single entry point, routes to `lb://` services, validates JWT, adds `X-Correlation-Id`, applies circuit breakers with fallbacks. |
| Backend for front-end | Partly | `/mobile/orders/**` shows a client-shaped URL space. A real BFF is a separate gateway per client type (mobile, web) owned by that client team; add another gateway module with its own routes. |

### Service discovery
| Pattern | Status | Explanation |
|---|---|---|
| Service registry | Implemented | `discovery-server` (Eureka). |
| Self registration | Implemented | Every service registers itself on startup (Eureka client in the chassis). |
| Client-side discovery | Implemented | The gateway and the `@LoadBalanced` RestClient resolve service names from the registry and pick an instance. |
| Server-side discovery | Documented | On Kubernetes/AWS ELB the platform does it: clients call a stable name (`http://order-service`) and the router picks an instance. Drop Eureka and keep the same URLs. |
| 3rd party registration | Documented | An external agent (Kubernetes, Consul agent) registers instances so services need no registry code. |

### Reliability and security
| Pattern | Status | Explanation |
|---|---|---|
| Circuit breaker | Implemented | Resilience4j in the gateway (route filter with fallback) and in `OrderDetailsComposer` (degraded answer when a dependency is slow or failing). |
| Access token | Implemented | Gateway is an OAuth2 resource server validating a signed JWT (HS256). `/auth/token` is a **demo-only** issuer with a hard-coded demo login; use Keycloak/Okta/Entra in real systems. Downstream services trust the gateway; add the resource-server dependency to them for defence in depth. |

### Cross-cutting concerns
| Pattern | Status | Explanation |
|---|---|---|
| Microservice chassis | Implemented | The `common` module auto-configures outbox, idempotency, topics, correlation filter and error handling for any service that depends on it. |
| Externalized configuration | Implemented | `config-server` serves `application.yml` and `payment-service.yml` (credit limit); services import it with `optional:configserver:`, plus env vars (`KAFKA_BOOTSTRAP`, `EUREKA_URL`, ...) for deployment. |
| Service template | Implemented | Every service has the same shape: `pom` + `application.yml` + chassis + the shared `Dockerfile`. Copy a module to start a new service. |

### Testing
| Pattern | Status | Explanation |
|---|---|---|
| Service component test | Implemented | `OrderSagaComponentTest`: the whole order service with a real Spring context and DB, Kafka stubbed out; drives happy path, compensation and rejection. |
| Consumer-driven contract test | Implemented (hand-rolled) | `ReserveStockContractTest` pins the message shape inventory expects from order-service. Use Spring Cloud Contract or Pact to share these contracts automatically with the producer build. |
| Consumer-side contract test | Documented | The consumer's test against a stub generated from the producer's contract (e.g. the composer against a WireMock/Contract stub of payment-service). |

### Deployment
| Pattern | Status | Explanation |
|---|---|---|
| Service instance per container | Implemented | `Dockerfile` + `docker-compose.yml`: one container per service instance. |
| Multiple instances per host / per host / per VM | Documented | Alternatives to containers: run several JVMs on one machine, one JVM per machine, or one VM image per service. Same jars, more operational weight. |
| Serverless deployment | Documented | Could host the stateless listeners (notification) as functions; not suited to the saga orchestrator's persistent state. |
| Service deployment platform | Documented | Run the containers on Kubernetes/ECS: it provides scheduling, scaling, service discovery and rolling updates (the compose file is the local stand-in). |
| Sidecar / Service mesh | Documented | Move retries, mTLS and tracing out of the app into a proxy (Istio/Linkerd); the Resilience4j code could then be reduced. |

### Observability
| Pattern | Status | Explanation |
|---|---|---|
| Health check API | Implemented | `/actuator/health` (+ liveness/readiness probes) on every service. |
| Application metrics | Implemented | Micrometer → `/actuator/prometheus`. |
| Distributed tracing | Implemented | Micrometer Tracing (Brave) → Zipkin at http://localhost:9411. |
| Log aggregation | Implemented (format) | Every line carries service, `traceId` and `cid` (correlation id also stored on outbox messages and Kafka headers). Ship stdout to ELK/Loki to aggregate. |
| Audit logging | Implemented | `AuditLog` writes business actions (order created/approved, payment declined) to a dedicated `AUDIT` logger. |
| Exception tracking | Implemented (hook) | `GlobalExceptionHandler` logs unexpected errors in one place; point it at Sentry or similar. |
| Log deployments and changes | Documented | Record every deploy/config change (CI/CD events, config-server git history, Kubernetes audit) to correlate incidents with changes. |

### UI design
| Pattern | Status | Explanation |
|---|---|---|
| Server-side page fragment composition | Documented | A server assembles HTML from fragments owned by different services. This project is API-only. |
| Client-side UI composition | Documented | The browser/micro-frontend loads each service's UI piece independently. Not in scope here. |

## Known simplifications (read before production use)
- H2 in-memory databases and a single-partition Kafka topic keep the demo runnable; use PostgreSQL and more partitions (keyed by `orderId`) for real.
- Failed message processing uses Spring Kafka's default retry then logs and skips; add a dead-letter topic.
- Outbox rows are never purged and the polling publisher is not safe to run on several instances at once (use `SELECT ... FOR UPDATE SKIP LOCKED` or Debezium).
- The demo token issuer, JWT secret default and `demo/demo` login are for local use only; override `JWT_SECRET`.
- No rate limiting at the gateway (Spring Cloud Gateway's `RequestRateLimiter` needs Redis).
