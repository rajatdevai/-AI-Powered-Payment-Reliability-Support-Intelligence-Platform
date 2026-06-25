# PRISM — Redis Key Reference
## Version: 1.0 | Owner: AI_ENGINEERING_OPERATING_SYSTEM.md § 4.3

> **Rule:** Only these keys are canonical. No service may write Redis keys not defined here.
> Redis IRIS keys are documented separately — they are owned exclusively by `agent-service`.

---

## 1. Route Health

**Key:** `route:health:{route_key}`
**Type:** Redis Hash
**Writer:** `route-health-engine` (Node.js)
**Readers:** `prediction-engine` (Python), `api-gateway` (Node.js), `incident-engine` (Python)
**TTL:** None — updated in-place every 10 seconds by route-health-engine

### Fields
| Field | Type | Example | Description |
|---|---|---|---|
| `route_key` | string | `HDFC_SBI` | Canonical route identifier |
| `health_score` | float | `87.4` | Composite reliability score 0–100 |
| `success_rate` | float | `92.1` | % of transactions succeeded in last window |
| `failure_rate` | float | `6.2` | % failed |
| `timeout_rate` | float | `1.7` | % timed out |
| `p95_ms` | int | `430` | P95 latency in milliseconds |
| `p99_ms` | int | `1200` | P99 latency in milliseconds |
| `total_transactions` | int | `847` | Window transaction count |
| `last_updated` | ISO 8601 | `2024-01-15T07:32:00Z` | Last recalculation time |

### Example
```
HGETALL route:health:HDFC_SBI
1) "route_key"          → "HDFC_SBI"
2) "health_score"       → "87.4"
3) "success_rate"       → "92.1"
4) "failure_rate"       → "6.2"
5) "timeout_rate"       → "1.7"
6) "p95_ms"             → "430"
7) "p99_ms"             → "1200"
8) "total_transactions" → "847"
9) "last_updated"       → "2024-01-15T07:32:00Z"
```

---

## 2. Bank Health

**Key:** `bank:health:{bank_code}`
**Type:** Redis Hash
**Writer:** `bank-health-engine` (Node.js)
**Readers:** `prediction-engine`, `api-gateway`, `incident-engine`
**TTL:** None — updated every 10 seconds

### Fields
| Field | Type | Example | Description |
|---|---|---|---|
| `bank_id` | string | `HDFC` | BankCode enum |
| `health_score` | float | `91.0` | 0–100 |
| `sla_compliance` | float | `98.4` | % uptime within SLA window |
| `avg_latency_ms` | int | `210` | Rolling average latency |
| `active_incidents_count` | int | `0` | Incidents touching this bank |
| `last_updated` | ISO 8601 | `2024-01-15T07:32:00Z` | |

---

## 3. Prediction Cache

**Key:** `prediction:{sender_bank}:{receiver_bank}`
**Type:** Redis String (JSON)
**Writer:** `prediction-engine` (Python)
**Readers:** `prediction-engine` (cache hit check), `payment-orchestrator` (Node)
**TTL:** `30 seconds`

> Short TTL ensures fresh predictions. Route conditions can change quickly during incidents.

### Value (JSON)
```json
{
  "route_key": "HDFC_SBI",
  "success_probability": 91.4,
  "risk_level": "LOW",
  "recommendation": "Safe to proceed.",
  "route_health_score": 87.4,
  "active_incidents": [],
  "cached": true,
  "generated_at": "2024-01-15T07:31:45Z"
}
```

---

## 4. Active Incident per Route

**Key:** `incident:active:{route_key}`
**Type:** Redis String (JSON)
**Writer:** `incident-engine` (Python) — set on `INCIDENT_CREATED`, delete on `INCIDENT_RESOLVED`
**Readers:** `prediction-engine`, `api-gateway`
**TTL:** None — explicitly deleted when incident resolves

### Value (JSON)
```json
{
  "incident_id": "inc_abc123",
  "route": "HDFC_SBI",
  "severity": "CRITICAL",
  "description": "Route HDFC → SBI degraded. Failure rate: 72%",
  "created_at": "2024-01-15T07:30:00Z"
}
```

---

## 5. Blast Radius Cache

**Key:** `blast:radius:{incident_id}`
**Type:** Redis String (JSON)
**Writer:** `blast-radius-engine` (Python)
**Readers:** `api-gateway`, `websocket-gateway`, `agent-service`
**TTL:** `3600 seconds` (1 hour — incidents rarely last longer)

### Value (JSON)
```json
{
  "incident_id": "inc_abc123",
  "affected_routes": ["HDFC_SBI", "HDFC_AXIS"],
  "affected_banks": ["HDFC", "SBI"],
  "affected_psps": ["razorpay"],
  "affected_merchants": ["AMAZON_IN", "SWIGGY"],
  "affected_users_count": 14200,
  "estimated_txn_impact": 3400,
  "calculated_at": "2024-01-15T07:30:05Z"
}
```

---

## 6. Redis IRIS — Agent Memory (agent-service ONLY)

> These keys are owned exclusively by `agent-service`.
> No other service reads or writes them.
> Violation of this rule is prohibited by AI_ENGINEERING_OPERATING_SYSTEM.md § 4.1.

**Conversation Context:**
- Key: `prism:session:{session_id}:context`
- Type: Redis List (LPUSH, LRANGE)
- TTL: `86400 seconds` (24 hours)

**Transaction RCA Summary:**
- Key: `prism:txn:{transaction_id}:rca_summary`
- Type: Redis String (JSON)
- TTL: `3600 seconds`

**Transaction Reversal:**
- Key: `prism:txn:{transaction_id}:reversal`
- Type: Redis String (JSON)
- TTL: `3600 seconds`

**Incident Summary:**
- Key: `prism:incident:{incident_id}:summary`
- Type: Redis String
- TTL: `1800 seconds`

**Customer History:**
- Key: `prism:customer:{customer_id}:history`
- Type: Redis List
- TTL: `86400 seconds`

---

## TTL Summary

| Key Pattern | TTL | Rationale |
|---|---|---|
| `route:health:*` | None | Updated every 10s in-place |
| `bank:health:*` | None | Updated every 10s in-place |
| `prediction:*` | 30s | Route conditions change fast |
| `incident:active:*` | None | Explicitly deleted on resolution |
| `blast:radius:*` | 3600s | Incidents are short-lived |
| `prism:session:*` | 86400s | 24-hour session window |
| `prism:txn:*` | 3600s | Short-term agent memory |
| `prism:incident:*:summary` | 1800s | 30-minute window |
| `prism:customer:*` | 86400s | Daily customer context |
