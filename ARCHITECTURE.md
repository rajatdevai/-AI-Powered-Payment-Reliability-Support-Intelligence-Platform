# PRISM — Architecture Decision Record
## Version 1.0 | Status: ACTIVE

> This document explains the **why** behind every major architectural decision in PRISM.
> Every decision here should be considered settled. Changes require updating this document first.

---

## 1. System Overview

PRISM is three platforms running as a unified system:

```
┌─────────────────────────────────────────────────────────────────┐
│  customer-portal      bpo-console         ops-console           │
│  (End Users)          (Support Agents)    (Engineering)         │
└──────────┬───────────────────┬──────────────────────┬───────────┘
           │  REST + WebSocket │                      │
           ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                       api-gateway (Node)                        │
│           Auth · Rate Limit · Response Aggregation              │
└──────────┬───────────────────────────────┬──────────────────────┘
           │  REST                         │  gRPC
           ▼                              ▼
┌──────────────────────┐        ┌─────────────────────────────────┐
│ payment-orchestrator │        │        agent-service            │
│      (Node)          │        │          (Python)               │
│  Kafka publisher     │        │       LangGraph agents          │
└──────────┬───────────┘        └─────────────────────────────────┘
           │  Kafka (async)
           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Python Intelligence Services                        │
│  prediction  incident  rca  reversal  blast-radius  fraud       │
└────────┬──────────────────────────────────────────┬────────────┘
         │  Kafka (publish results)                  │  gRPC
         ▼                                          ▼
┌──────────────────────────┐              ┌──────────────────────┐
│   websocket-gateway      │              │   PostgreSQL +        │
│   (Node / Socket.IO)     │              │   Redis + Neo4j +     │
│   Live frontend updates  │              │   Qdrant              │
└──────────────────────────┘              └──────────────────────┘
```

---

## 2. Why a Hybrid Polyglot Architecture?

**The mistake:** Use one language for everything.

**The approach:** Use each language where it wins.

### Node.js wins at:
- High-concurrency I/O (thousands of simultaneous WebSocket connections)
- Event-driven transaction orchestration
- Real-time streaming (Kafka → WebSocket in milliseconds)
- Low-latency REST APIs
- TypeScript for contract-safe inter-service communication

### Python wins at:
- Machine learning (scikit-learn, XGBoost, LightGBM)
- Graph algorithms (Neo4j Python driver is more mature)
- LLM orchestration (LangChain, LangGraph are Python-native)
- Vector search (Qdrant Python client)
- Numerical computing (NumPy, Pandas for time-series analysis)
- Scientific ecosystem maturity

**Result:** The right tool for each job. Not a compromise.

---

## 3. Service Boundaries

### Node.js Services

| Service | Responsibility | Why Node |
|---|---|---|
| `api-gateway` | Auth, routing, rate limiting, response aggregation | I/O-bound, handles thousands of concurrent REST requests |
| `payment-orchestrator` | Transaction lifecycle, Kafka publishing, gRPC orchestration | Event-driven, coordinates multiple async operations |
| `websocket-gateway` | Live dashboard updates via Socket.IO | Node is the best runtime for WebSocket at scale |
| `notification-service` | Email/SMS/webhook Kafka consumer | I/O-bound, no computation |

### Python Services

| Service | Responsibility | Why Python |
|---|---|---|
| `prediction-engine` | ML scoring, gRPC server | scikit-learn, NumPy ecosystem |
| `incident-engine` | Anomaly detection, failure spike analysis | Future: Prophet, LSTM for time-series |
| `blast-radius-engine` | Neo4j graph traversal, impact calculation | Python Neo4j driver + graph algorithms |
| `rca-engine` | LLM synthesis, Qdrant RAG, Neo4j evidence | LangChain/LangGraph are Python-native |
| `reversal-engine` | Historical matching, ETA prediction | Pandas for historical analysis |
| `agent-service` | All AI agents via LangGraph | LangGraph is Python-only |

---

## 4. Why Kafka? (Not REST Between Services)

**The wrong approach:**
```
payment-orchestrator → REST → rca-engine
payment-orchestrator → REST → reversal-engine
payment-orchestrator → REST → blast-radius-engine
```

Problems:
- Tight coupling: payment-orchestrator must know every downstream service
- If any downstream fails, payment-orchestrator fails
- No replay capability
- Latency added to the critical payment path

**The Kafka approach:**
```
payment-orchestrator → publishes payment.failed
  └── rca-engine consumes (independently)
  └── reversal-engine consumes (independently)
  └── blast-radius-engine consumes (independently)
  └── incident-engine consumes (independently)
```

Benefits:
- **Decoupling:** payment-orchestrator knows nothing about downstream services
- **Durability:** Events are persisted — consumers can replay on failure
- **Independent scaling:** Each consumer scales independently
- **Zero impact on payment path:** User never waits for RCA or blast radius
- **Audit trail:** Every state change is an immutable event

**When Kafka is NOT used:** Synchronous pre-transaction queries.
Before a payment, we need `success_probability` immediately. gRPC is used here.

---

## 5. Why gRPC? (For Synchronous Calls)

Node → Python sync calls use gRPC, not REST.

**Why not REST:**
- JSON parsing overhead
- No schema enforcement
- No streaming support
- No type safety between Node and Python

**Why gRPC:**
- **Protocol Buffers:** Binary serialization — ~10x faster than JSON
- **Schema-first:** `.proto` files are the single source of truth
- **Bidirectional streaming:** Used in agent-service for streaming LLM responses
- **Type safety:** Generated stubs in TypeScript and Python — compile-time contract enforcement
- **Performance:** P99 < 50ms for prediction calls vs. 150ms for REST

---

## 6. Database Responsibilities

### PostgreSQL — Source of Truth

**Stores:** Transactions, Incidents, RCA Reports, Reversal Predictions, Support Cases, Users, Merchants

**Why Postgres:**
- ACID compliance: payment records must never be corrupted
- Complex queries: JOIN across transactions + incidents + RCA reports
- Prisma ORM: type-safe queries, migration management
- JSON columns for flexible blast_radius and evidence fields
- Proven at scale in fintech (Stripe, Razorpay use Postgres)

**Critical rule:** Postgres is the record of truth. Redis and Neo4j are derived from Postgres data.

### Redis — Hot Cache

**Stores:** Route health scores, bank health, prediction results, active incident pointers

**Why Redis:**
- Sub-millisecond read latency for pre-transaction checks
- Hash data type maps perfectly to RouteHealth, BankHealth structs
- TTL support for prediction cache (30-second freshness)
- Can handle 100,000+ read ops/second for dashboard queries

**Critical rule:** Redis is a cache. If Redis is flushed, all data can be reconstructed by re-running the health engines.

### Redis IRIS — Agent Memory

**Stores:** Conversation context, RCA summaries, customer history

**Why separate from Redis cache:**
- Different TTL requirements (24 hours vs. 30 seconds)
- Different access pattern (agent-service only, no other consumer)
- Semantic separation: operational cache vs. cognitive memory
- Future: Redis IRIS has native vector capability for in-memory semantic search

### Neo4j — Topology Graph

**Stores:** Banks, PSPs, Merchants, NPCI, and their relationships

**Why Neo4j (not Postgres adjacency list):**
- Blast radius requires graph traversal: "find all merchants affected by an HDFC incident"
- SQL for graph traversal requires recursive CTEs that degrade with depth
- Neo4j traverses multi-hop graphs in milliseconds
- Cypher is expressive for relationship queries
- Path finding algorithms are built-in (shortest path, centrality)

**Example query that Postgres cannot do efficiently:**
```cypher
MATCH path = (incident_bank:Bank {id: 'HDFC'})<-[:USES*1..3]-(affected)
RETURN affected, length(path) AS hops
```

### Qdrant — Vector Store

**Stores:** Historical failures, RCA reports, SOPs, playbooks

**Why Qdrant (not pgvector):**
- Purpose-built vector database (vs. Postgres extension)
- Filtered vector search: "find similar failures WHERE error_code = 'TIMEOUT'"
- Native payload indexing for pre-filtering
- Horizontal scalability without impact on Postgres
- Separation of concerns: analytical queries don't impact transactional Postgres

---

## 7. Event Flow — Complete End-to-End

### Happy Path (Payment Succeeds)
```
User → customer-portal → api-gateway → payment-orchestrator
payment-orchestrator → gRPC → prediction-engine → cache check → PredictResponse
payment-orchestrator → bank simulator → SUCCESS
payment-orchestrator → Kafka: payment.initiated, payment.success
websocket-gateway → consumes payment.success → Socket.IO → customer-portal
customer-portal → shows "Payment Successful" timeline
```

### Failure Path (Payment Fails)
```
payment-orchestrator → bank simulator → FAILED
payment-orchestrator → Kafka: payment.failed
  ├── rca-engine consumes:
  │     Neo4j topology traversal
  │     Qdrant RAG search on similar failures
  │     LLM synthesis → RcaReport
  │     Kafka: rca.generated
  │     Postgres: rca_reports INSERT
  │
  ├── reversal-engine consumes:
  │     Historical pattern matching
  │     ETA calculation → ReversalPrediction
  │     Kafka: reversal.predicted
  │     Postgres: reversal_predictions INSERT
  │
  └── incident-engine consumes:
        Checks route failure rate threshold
        If threshold exceeded → Incident created
        Kafka: incident.created
        Postgres: incidents INSERT
          └── blast-radius-engine consumes:
                Neo4j traversal → blast radius
                Kafka: blast_radius.calculated
                Redis: blast:radius:{incident_id}

payment-orchestrator consumes rca.generated, reversal.predicted:
  Postgres: transactions UPDATE (root_cause, expected_reversal)

websocket-gateway consumes all → Socket.IO → frontend:
  Customer sees live timeline updates
  BPO console sees incident + blast radius
  Ops console sees route degradation
```

---

## 8. AI Agent Layer

### Why LangGraph (not custom orchestration)?

- LangGraph implements a proper state machine for agent execution
- Built-in support for agent memory and context injection
- Native streaming for BPO copilot responses
- Tool calling is first-class (not bolted on)
- Easier to add new agents without breaking existing ones

### Agent Boundaries (enforced)

```
supervisor-agent
  Never queries a database directly
  Never calls an engine directly
  Only routes to sub-agents

support-agent
  Reads: Redis IRIS (memory), Postgres (via api-gateway)
  Does NOT: call Neo4j, Qdrant, or any engine directly

rca-agent
  Reads: Neo4j (topology), Qdrant (RAG), Postgres (rca_reports)
  Writes: Redis IRIS (RCA summary cache)
```

### Redis IRIS Memory Pattern

```python
# Before any LLM call, check IRIS
cached = iris.get(f"prism:txn:{txn_id}:rca_summary")
if cached:
    return cached  # Zero LLM cost

# On cache miss: generate, cache, return
rca = rca_agent.run(txn_id)
iris.set(f"prism:txn:{txn_id}:rca_summary", rca, ex=3600)
return rca
```

This is the difference between a demo and a production AI system.
Production systems never call the LLM for the same question twice.

---

## 9. Frontend Architecture

Three separate Next.js 15 applications (not a single monolith):

| App | Port | Users | Key Feature |
|---|---|---|---|
| `customer-portal` | 3000 | End users | PRISM overlay before payment, live timeline |
| `bpo-console` | 3001 | Support agents | Case management, AI copilot, full trace view |
| `ops-console` | 3002 | Engineering | Real-time dashboards, topology graph, blast radius |

**Why separate apps (not Next.js multi-zone in one app):**
- Different authentication systems (customer OAuth vs. BPO SAML vs. ops internal SSO)
- Different deployment frequencies (ops-console deploys without impacting customer-portal)
- Different permission models
- Independent scaling (ops-console serves 20 engineers; customer-portal serves millions)

**Why Next.js 15:**
- App Router + Server Components for initial page load performance
- Streaming for agent responses (chat interface)
- Strong TypeScript support for shared types from `@prism/schemas`
- Ant Design enterprise components (tables, drawers, modals, forms)

---

## 10. Deployment Topology (Future)

```
customer-portal     → Vercel or CDN
bpo-console         → Internal network (VPN-gated)
ops-console         → Internal network (VPN-gated)
api-gateway         → Cloud Run / ECS (auto-scaling)
payment-orchestrator → Cloud Run (stateless)
websocket-gateway   → Cloud Run (sticky sessions)
Python services     → Cloud Run / ECS (CPU-optimised instances)
PostgreSQL          → Cloud SQL / RDS (managed)
Redis               → ElastiCache / Redis Enterprise
Neo4j               → Neo4j AuraDB
Qdrant              → Qdrant Cloud
Kafka               → Confluent Cloud / MSK
```

---

*This document is version-controlled. Any change to a decision here requires a corresponding update to AI_ENGINEERING_OPERATING_SYSTEM.md § 4.*
