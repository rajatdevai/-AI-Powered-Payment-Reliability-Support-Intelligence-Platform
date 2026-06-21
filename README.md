# PRISM
### AI-Powered Payment Reliability & Support Intelligence Platform

> **Demonstrates:** Principal Engineer · Staff AI Engineer · Solutions Architect · Payments Domain Architect

---

## What PRISM Is

Three platforms, one system:

| Layer | What It Does |
|---|---|
| **Payment Observability** | Real-time TPS, route health, bank scores, latency P95/P99, incident tracking |
| **Reliability Intelligence** | Pre-transaction risk prediction, blast radius, RCA, reversal timeline |
| **Support Copilot** | AI-powered BPO console, customer AI assistant, case management |

---

## Who It Serves

**Persona 1 — Payment Users**
- Will my payment succeed before I try?
- Why did my payment fail?
- Where is my money right now?
- When will my refund arrive?

**Persona 2 — BPO / Customer Support Agents**
- Customer just called. Transaction failed. Give me the answer in 10 seconds.
- What is the root cause? Which component failed?
- What do I tell the customer about the refund?
- Should I escalate this case?

---

## Architecture — Hybrid Polyglot

> The rule: use each technology where it has the highest ROI. Not everything in Node. Not everything in Python.

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                            │
│   customer-portal    bpo-console    ops-console                  │
│   Next.js 15 · TypeScript · Ant Design · TanStack Query          │
│   Zustand · Recharts · Socket.IO Client                          │
└─────────────────────┬────────────────────────────────────────────┘
                       │  REST + WebSocket
┌──────────────────────▼───────────────────────────────────────────┐
│                      NODE.JS LAYER                               │
│                                                                  │
│   api-gateway          → Auth, routing, REST endpoints           │
│   payment-orchestrator → Transaction lifecycle, Kafka publish    │
│   websocket-gateway    → Live dashboards, incident streams       │
│   notification-service → Email, SMS, webhook delivery            │
│                                                                  │
│   Stack: Fastify · TypeScript · KafkaJS · Socket.IO · Prisma     │
└──────────┬──────────────────────────────────┬────────────────────┘
           │  Kafka (async)                   │  gRPC (sync)
           │  payment.initiated               │  PredictPaymentSuccess()
           │  payment.failed                  │  GetRouteHealth()
           ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      PYTHON LAYER                                │
│                                                                  │
│   prediction-engine   → Success probability, risk scoring        │
│   incident-engine     → Spike detection, anomaly detection       │
│   blast-radius-engine → Affected scope via Neo4j traversal       │
│   rca-engine          → Root cause via Neo4j + Qdrant RAG        │
│   reversal-engine     → Refund ETA + confidence                  │
│   agent-service       → All AI agents (LangGraph + LLM)          │
│                                                                  │
│   Stack: FastAPI · LangGraph · OpenAI · Qdrant · Neo4j           │
└──────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼──────────────────┐
              ▼                ▼                  ▼
         PostgreSQL          Redis             Neo4j
         (source of truth)   (hot cache)       (topology)
                               │
                             Qdrant
                          (vector store)
```

---

## Technology Stack — Decision Rationale

### Frontend — Three Next.js Applications

| App | Users | Purpose |
|---|---|---|
| `customer-portal` | End users | Checkout, transaction history, AI chat assistant |
| `bpo-console` | Support agents | Case management, transaction investigation, AI copilot |
| `ops-console` | Engineering | Reliability dashboard, incident board, topology graph |

**Stack:**
```
Next.js 15        App Router, Server Components, Streaming
React 19          Concurrent rendering
TypeScript        End-to-end type safety
Ant Design        Enterprise tables, modals, drawers, forms
Tailwind CSS      Utility-first layout
TanStack Query    Server state, real-time polling, cache invalidation
Zustand           Client state (session, filters, UI state)
Recharts          TPS, latency, success rate charts
Socket.IO Client  Live incident streams, transaction updates
```

---

### Node.js Layer — Where Node Wins

Node wins on: **high concurrency, I/O-heavy workloads, event-driven systems, real-time connections.**

```
api-gateway
  Fastify + TypeScript
  Auth (JWT), rate limiting
  Routes all REST calls to correct service
  Aggregates responses for frontend

payment-orchestrator
  Fastify + TypeScript + KafkaJS + Prisma
  Payment initiation, route selection
  Calls prediction-engine via gRPC before payment
  Publishes to Kafka: payment.initiated, payment.success, payment.failed
  Consumes from Kafka: rca.generated, reversal.generated → updates Postgres
  Streams updates to websocket-gateway

websocket-gateway
  Socket.IO + TypeScript
  Maintains WebSocket connections for all three frontends
  Consumes Kafka topics → pushes live updates to correct clients
  Handles: incident.created, rca.generated, route.metrics

notification-service
  Kafka consumer
  Email / SMS / webhook delivery
  Triggered by: payment.failed, incident.created, support.case.created
```

---

### Python Layer — Where Intelligence Lives

Python wins on: **ML models, graph algorithms, LLM orchestration, vector search, numerical computing.**

```
prediction-engine
  FastAPI + scikit-learn (Phase 1: rule-based, Phase 2: XGBoost/LightGBM)
  gRPC server: PredictPaymentSuccess(sender, receiver, amount)
  Inputs: route health (Redis), bank health (Redis), active incidents (Postgres)
  Returns: { success_probability, risk_level, recommendation }
  Caches result in Redis (TTL: 30s per route)

incident-engine
  FastAPI + Kafka consumer
  Consumes: route.metrics
  Detects: failure rate spikes, latency anomalies, timeout clusters
  Publishes: incident.created, incident.resolved
  Future: time-series anomaly detection (Prophet / LSTM)

blast-radius-engine
  FastAPI + Neo4j
  Consumes: incident.created
  Traverses payment network graph
  Calculates: affected users, merchants, routes, PSPs
  Publishes: blast_radius.calculated
  Stores: Redis (instant retrieval)

rca-engine
  FastAPI + Neo4j + Qdrant + LLM
  Consumes: payment.failed
  Step 1: Neo4j — find affected component in topology
  Step 2: Qdrant — RAG search on historical failure patterns
  Step 3: LLM — synthesize evidence into human-readable RCA
  Publishes: rca.generated
  Stores: Postgres (with confidence score + evidence)

reversal-engine
  FastAPI + Qdrant
  Consumes: payment.failed
  Finds similar historical failures
  Predicts: refund_eta, reversal_confidence
  Publishes: reversal.predicted
  Stores: Postgres

agent-service
  FastAPI + LangGraph + OpenAI/Claude
  Hosts all AI agents
  Uses Redis IRIS for conversation memory
  Uses Qdrant for knowledge retrieval (SOPs, playbooks)
  Agents: Supervisor, Support, BPO Copilot, Reliability, RCA, Incident, Knowledge
```

---

## Internal Communication — No REST Between Services

```
Async Communication → Kafka
  payment.initiated       Node → Python (incident-engine monitors)
  payment.processing      Node → Node (websocket-gateway streams)
  payment.success         Node → all consumers
  payment.failed          Node → Python (rca-engine, reversal-engine, blast-radius-engine)
  payment.timeout         Node → Python
  payment.refund          Node → all consumers
  route.metrics           Node → Python (incident-engine)
  incident.created        Python → Node (websocket-gateway, notification-service)
  incident.resolved       Python → Node
  rca.generated           Python → Node (payment-orchestrator updates Postgres)
  reversal.predicted      Python → Node
  blast_radius.calculated Python → Node (websocket-gateway streams to ops-console)
  support.case.created    Node → Node (notification-service)
  support.case.closed     Node → Node
  fraud.detected          Python → Node

Sync Communication → gRPC
  payment-orchestrator → prediction-engine
    PredictPaymentSuccess(sender_bank, receiver_bank, amount, route_history)
    Returns: { success_probability, risk_level, recommendation, cached }

  payment-orchestrator → incident-engine
    GetActiveIncidents(route_key)
    Returns: [{ incident_id, severity, description }]

  api-gateway → agent-service
    RunAgentQuery(session_id, persona, message, context)
    Returns: { response, agent_trace, memory_updated }
```

---

## Checkout Flow — Before & After Payment

### Before Payment (Synchronous — User Waits)
```
User clicks Pay
     │
     ▼
payment-orchestrator (Node)
     │
     ├── gRPC → prediction-engine (Python)
     │          Inputs: sender_bank, receiver_bank, amount
     │          Redis cache check first (30s TTL)
     │          Returns: { success_probability: 92, risk: "LOW" }
     │
     └── Response to frontend:
          {
            "success_probability": 92,
            "risk": "LOW",
            "recommendation": "Safe to Proceed",
            "route_health": 97,
            "active_incidents": []
          }
```
**User sees this instantly. No payment has been attempted yet.**

### After Payment (Asynchronous — User Does Not Wait)
```
payment.failed published to Kafka
     │
     ├── rca-engine consumes → publishes rca.generated
     │
     ├── reversal-engine consumes → publishes reversal.predicted
     │
     ├── blast-radius-engine consumes → publishes blast_radius.calculated
     │
     └── websocket-gateway streams all updates → frontend updates live

User sees timeline update in real-time:
  12:01 Payment Initiated
  12:02 Routed via NPCI
  12:03 Timeout at Issuer Bank
  12:04 RCA: HDFC issuer gateway — 91% confidence
  12:05 Refund ETA: 14 minutes
```

---

## Redis IRIS — Agent Memory Layer

Used **only in agent-service.** Not a general cache — this is conversation and operational memory.

```
Key Structure:
  prism:session:{session_id}:context     → Full conversation history
  prism:txn:{txn_id}:rca_summary        → Pre-generated RCA (avoid re-analysis)
  prism:txn:{txn_id}:reversal           → Refund ETA + confidence
  prism:incident:{incident_id}:summary  → Incident summary for agents
  prism:customer:{customer_id}:history  → Last N interaction summaries
```

**Flow:**
```
BPO Agent asks: "Why did txn_abc123 fail?"
     │
     ├── Check Redis IRIS: prism:txn:abc123:rca_summary
     │   HIT → return instantly, no LLM call
     │   MISS → call rca-engine gRPC → store result → return
     │
     └── Session context appended for multi-turn conversation
```

---

## Database — Each Chosen with Precision

| Database | Role | Stores |
|---|---|---|
| **PostgreSQL** | Source of Truth | Transactions, Incidents, RCA Reports, Cases, Refunds, Agents, Users |
| **Redis** | Hot Cache | Route health scores, bank scores, prediction cache, incident cache |
| **Redis IRIS** | Agent Memory | Conversation context, RCA summaries, incident summaries, customer history |
| **Neo4j** | Topology Graph | Payment network, PSP dependencies, blast radius traversal |
| **Qdrant** | Vector Store | Historical failures, RCA reports, SOPs, playbooks, resolution patterns |

---

## AI Agent Architecture

**Rule: Each agent has exactly one job. Supervisor routes. Agents execute.**

```
supervisor-agent
  Input: user query + persona (customer | bpo | ops)
  Output: routed to correct sub-agent
  Never performs business logic

support-agent
  Persona: customer-facing
  Handles: why failed, refund status, will payment succeed
  Tone: simple, reassuring
  Uses: rca summary (Redis IRIS), reversal ETA (Redis IRIS)

bpo-copilot-agent
  Persona: support staff
  Handles: full case context for agent
  Provides: RCA summary, suggested customer response, escalation recommendation
  Uses: Redis IRIS memory (full session), all engine outputs

reliability-agent
  Handles: route health queries, incident status, prediction lookups
  Uses: Redis (route health), Postgres (incidents)

rca-agent
  Handles: deep failure analysis on demand
  Uses: Neo4j (topology), Qdrant (RAG on historical), LLM (synthesis)

incident-agent
  Handles: incident analysis, blast radius explanation
  Uses: Redis (blast radius), Postgres (incident record)

knowledge-agent
  Handles: SOPs, policies, playbooks
  Uses: Qdrant (semantic search over documents)
```

---

## Domain Model — Core Entities

```typescript
Transaction {
  id: string
  amount: number
  currency: string
  sender_bank: BankCode
  receiver_bank: BankCode
  psp_id: string
  merchant_id: string
  status: PENDING | SUCCESS | FAILED | TIMEOUT | REVERSED
  route_path: string[]          // ["HDFC", "NPCI", "SBI"]
  latency_ms: number
  error_code: string | null
  error_message: string | null
  root_cause: string | null
  affected_component: string | null
  rca_confidence: number | null
  expected_reversal: string | null
  reversal_confidence: number | null
  created_at: DateTime
  settled_at: DateTime | null
}

Incident {
  id: string
  route: string
  severity: LOW | HIGH | CRITICAL
  status: ACTIVE | RESOLVED
  affected_users_count: number
  affected_merchants_count: number
  blast_radius: BlastRadius
  description: string
  root_cause: string | null
  created_at: DateTime
  resolved_at: DateTime | null
}

SupportCase {
  id: string
  transaction_id: string
  customer_id: string
  agent_id: string | null
  status: OPEN | IN_PROGRESS | RESOLVED | ESCALATED
  ai_rca_summary: string | null
  ai_suggested_response: string | null
  ai_escalation_recommendation: string | null
  refund_eta: string | null
  created_at: DateTime
  closed_at: DateTime | null
}

RouteHealth (Redis) {
  route_key: string             // "HDFC_SBI"
  health_score: number          // 0-100
  success_rate: number
  failure_rate: number
  p95_ms: number
  p99_ms: number
  timeout_rate: number
  last_updated: DateTime
}

BankHealth (Redis) {
  bank_id: BankCode
  health_score: number          // 0-100
  sla_compliance: number
  avg_latency_ms: number
  active_incidents_count: number
}
```

---

## Directory Structure

```
prism/
│
├── apps/
│   ├── customer-portal/              # Next.js 15 — End users
│   │   ├── checkout-ui/
│   │   ├── transaction-history/
│   │   └── ai-support-chat/
│   │
│   ├── bpo-console/                  # Next.js 15 — Support agents
│   │   ├── agent-dashboard/
│   │   ├── case-management/
│   │   ├── transaction-investigation/
│   │   └── ai-copilot/
│   │
│   └── ops-console/                  # Next.js 15 — Engineering ops
│       ├── reliability-dashboard/
│       ├── incident-dashboard/
│       ├── route-topology/
│       └── blast-radius/
│
├── services/
│   │
│   ├── node-services/                # Fastify + TypeScript
│   │   ├── api-gateway/              #   Auth, routing, REST
│   │   ├── payment-orchestrator/     #   Tx lifecycle + Kafka + gRPC client
│   │   ├── websocket-gateway/        #   Socket.IO + Kafka consumer
│   │   └── notification-service/     #   Email/SMS/webhook delivery
│   │
│   └── python-services/              # FastAPI + Python
│       ├── prediction-engine/        #   gRPC server, ML scoring
│       ├── incident-engine/          #   Kafka consumer, anomaly detection
│       ├── blast-radius-engine/      #   Neo4j traversal
│       ├── rca-engine/               #   Neo4j + Qdrant + LLM
│       ├── reversal-engine/          #   Refund ETA prediction
│       └── agent-service/            #   LangGraph agents + Redis IRIS
│
├── infrastructure/                   # Local setup scripts (no Docker for dev)
│   ├── postgres/                     #   Schema migrations, seed data
│   ├── redis/                        #   Key patterns, TTL config
│   ├── neo4j/                        #   Topology seed, Cypher queries
│   ├── qdrant/                       #   Collection definitions, doc seeds
│   └── kafka/                        #   Topic definitions, consumer groups
│
├── shared/
│   ├── protobuf/                     #   gRPC .proto files (Node ↔ Python)
│   ├── events/                       #   Kafka event schemas (TypeScript + Python)
│   └── schemas/                      #   Zod schemas (Node) + Pydantic (Python)
│
├── deployment/                       # Future — post local dev
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
│
├── package.json                      # npm workspaces root
├── .gitignore
└── README.md
```

---

## Implementation Phases

### Phase 1 — Shared Contracts + Infrastructure Setup
- gRPC `.proto` files for Node ↔ Python calls
- Kafka topic definitions (shared/events)
- Zod + Pydantic schemas for all entities (shared/schemas)
- PostgreSQL schema migrations
- Redis key pattern documentation
- Neo4j topology seed (Cypher)
- Qdrant collection setup

### Phase 2 — Payment Orchestrator + Prediction Engine
- `payment-orchestrator` (Node): Fastify server, Prisma, KafkaJS
- `prediction-engine` (Python): FastAPI + gRPC server, rule-based scoring
- gRPC call: `PredictPaymentSuccess` working end-to-end
- Kafka publishing: `payment.initiated`, `payment.success`, `payment.failed`

### Phase 3 — Health Engines + Incident Engine
- `incident-engine` (Python): Kafka consumer → auto incident creation
- Route health, bank health calculated every 10s → Redis
- Incident auto-resolution when health recovers

### Phase 4 — RCA + Reversal + Blast Radius
- `rca-engine` (Python): Neo4j + Qdrant + LLM → structured RCA
- `reversal-engine` (Python): historical matching → refund ETA
- `blast-radius-engine` (Python): Neo4j traversal → affected scope
- All publish to Kafka → Node consumes → Postgres updated

### Phase 5 — WebSocket Gateway + API Gateway
- `websocket-gateway` (Node): Socket.IO + Kafka consumer → live frontend updates
- `api-gateway` (Node): auth, rate limit, route aggregation
- REST endpoints documented (OpenAPI)

### Phase 6 — AI Agent Service
- All agents via LangGraph
- Redis IRIS memory integration
- Qdrant RAG for knowledge-agent
- gRPC: `RunAgentQuery` working end-to-end

### Phase 7 — Customer Portal
- Next.js 15 checkout with PRISM overlay
- Transaction timeline with live WebSocket updates
- AI support chat

### Phase 8 — BPO Console
- Case management, transaction investigation
- AI copilot panel

### Phase 9 — Ops Console
- Reliability dashboard, incident board
- Neo4j topology visualization
- Blast radius map

---

*Each phase prompt references this document as ground truth.*
*Nothing gets built that contradicts this specification.*
"# -AI-Powered-Payment-Reliability-Support-Intelligence-Platform" 
