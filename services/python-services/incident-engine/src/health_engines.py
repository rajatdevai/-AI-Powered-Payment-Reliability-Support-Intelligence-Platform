import logging
import numpy as np
from datetime import datetime
from src.config import settings
from src.db import (
    get_recent_transactions,
    get_active_incidents,
    create_incident,
    resolve_incident
)
from src.redis_client import (
    set_route_health,
    set_bank_health,
    set_psp_health,
    set_npci_health
)
from src.kafka_client import (
    publish_incident_created,
    publish_incident_resolved
)

logger = logging.getLogger("incident-engine.health")

def calculate_percentile(latencies: list, q: float) -> float:
    if not latencies:
        return 0.0
    return float(np.percentile(latencies, q))

async def run_health_cycle():
    logger.debug("Starting health calculation cycle...")
    try:
        # 1. Fetch transactions from the last 5 minutes (300 seconds)
        txns = get_recent_transactions(window_seconds=300)
        
        # If there are no transactions, we default health scores to 100
        if not txns:
            logger.debug("No transactions in the window. Setting default health scores.")
            # Set default healthy state for routes, banks, PSPs, and NPCI
            set_npci_health({"health_score": 100.0, "success_rate": 100.0, "avg_latency_ms": 150.0})
            return

        # Data groupings
        route_groups = {}
        bank_groups = {}
        psp_groups = {}
        npci_latencies = []
        npci_statuses = []

        for tx in txns:
            sender = tx["sender_bank"]
            receiver = tx["receiver_bank"]
            route_key = f"{sender}_{receiver}"
            psp = tx["psp_id"] or "UNKNOWN_PSP"
            status = tx["status"]
            latency = tx["latency_ms"] or 0

            # Route grouping
            if route_key not in route_groups:
                route_groups[route_key] = {"latencies": [], "statuses": []}
            route_groups[route_key]["latencies"].append(latency)
            route_groups[route_key]["statuses"].append(status)

            # Bank grouping (as sender)
            if sender not in bank_groups:
                bank_groups[sender] = {"latencies": [], "statuses": []}
            bank_groups[sender]["latencies"].append(latency)
            bank_groups[sender]["statuses"].append(status)

            # Bank grouping (as receiver)
            if receiver not in bank_groups:
                bank_groups[receiver] = {"latencies": [], "statuses": []}
            bank_groups[receiver]["latencies"].append(latency)
            bank_groups[receiver]["statuses"].append(status)

            # PSP grouping
            if psp not in psp_groups:
                psp_groups[psp] = {"latencies": [], "statuses": []}
            psp_groups[psp]["latencies"].append(latency)
            psp_groups[psp]["statuses"].append(status)

            # NPCI totals
            npci_latencies.append(latency)
            npci_statuses.append(status)

        # Get current active incidents
        active_incidents = {inc["route"]: inc for inc in get_active_incidents()}

        # 2. Process Routes
        for r_key, data in route_groups.items():
            total = len(data["statuses"])
            successes = data["statuses"].count("SUCCESS")
            failures = data["statuses"].count("FAILED")
            timeouts = data["statuses"].count("TIMEOUT")

            success_rate = (successes / total) * 100.0
            failure_rate = (failures / total) * 100.0
            timeout_rate = (timeouts / total) * 100.0
            p95 = calculate_percentile(data["latencies"], 95)
            p99 = calculate_percentile(data["latencies"], 99)

            # Health score calculation
            health_score = 100.0 - (failure_rate * 2.0) - (timeout_rate * 3.0)
            if p95 > 2000:
                health_score -= 10.0
            health_score = max(0.0, min(100.0, health_score))

            route_health_data = {
                "health_score": round(health_score, 1),
                "success_rate": round(success_rate, 1),
                "failure_rate": round(failure_rate, 1),
                "timeout_rate": round(timeout_rate, 1),
                "p95_ms": round(p95, 1),
                "p99_ms": round(p99, 1),
                "total_transactions": total
            }
            
            # Write to Redis
            set_route_health(r_key, route_health_data)

            # Incident Detection for Route
            is_degraded = (
                failure_rate > settings.FAILURE_RATE_THRESHOLD or
                timeout_rate > settings.TIMEOUT_RATE_THRESHOLD or
                p95 > settings.LATENCY_THRESHOLD_MS
            )

            if is_degraded:
                if r_key not in active_incidents:
                    # Create new incident
                    severity = "CRITICAL" if (failure_rate > 30.0 or timeout_rate > 20.0) else "HIGH"
                    desc = f"Route {r_key} performance degraded: failure rate {round(failure_rate, 1)}%, timeout rate {round(timeout_rate, 1)}%, P95 latency {round(p95, 1)}ms"
                    inc_id = create_incident(
                        route=r_key,
                        severity=severity,
                        description=desc,
                        blast_radius={
                            "affected_routes": [r_key],
                            "affected_banks": [r_key.split("_")[0], r_key.split("_")[1]],
                            "affected_psps": ["RAZORPAY"],
                            "affected_merchants": [],
                            "affected_users_count": total,
                            "estimated_txn_impact": total
                        }
                    )
                    if inc_id:
                        publish_incident_created(
                            incident_id=inc_id,
                            route=r_key,
                            severity=severity,
                            description=desc,
                            metric="failure_rate",
                            val=failure_rate
                        )
            else:
                if r_key in active_incidents:
                    # Resolve incident
                    inc = active_incidents[r_key]
                    resolved = resolve_incident(
                        incident_id=inc["incident_id"],
                        resolved_reason=f"Metrics returned to normal: success rate {round(success_rate, 1)}%"
                    )
                    if resolved:
                        created_time = datetime.fromisoformat(inc["created_at"].replace("Z", "")) if isinstance(inc["created_at"], str) else inc["created_at"]
                        dur_min = (datetime.utcnow() - created_time.replace(tzinfo=None)).total_seconds() / 60.0
                        publish_incident_resolved(
                            incident_id=inc["incident_id"],
                            route=r_key,
                            reason="Route recovered successfully",
                            duration_min=max(0.1, round(dur_min, 1))
                        )

        # 3. Process Banks
        for bank_id, data in bank_groups.items():
            total = len(data["statuses"])
            successes = data["statuses"].count("SUCCESS")
            sla_compliance = (len([l for l in data["latencies"] if l <= 2000]) / total) * 100.0
            avg_latency = float(np.mean(data["latencies"])) if data["latencies"] else 0.0

            bank_health_score = max(0.0, min(100.0, (successes / total) * 100.0))

            # Count active incidents involving this bank
            active_inc_count = sum(1 for r in active_incidents.keys() if bank_id in r)

            set_bank_health(bank_id, {
                "health_score": round(bank_health_score, 1),
                "sla_compliance": round(sla_compliance, 1),
                "avg_latency_ms": round(avg_latency, 1),
                "active_incidents_count": active_inc_count
            })

        # 4. Process PSPs
        for psp_id, data in psp_groups.items():
            total = len(data["statuses"])
            successes = data["statuses"].count("SUCCESS")
            success_rate = (successes / total) * 100.0
            avg_latency = float(np.mean(data["latencies"])) if data["latencies"] else 0.0

            set_psp_health(psp_id, {
                "health_score": round(success_rate, 1),
                "success_rate": round(success_rate, 1),
                "avg_latency_ms": round(avg_latency, 1)
            })

        # 5. Process NPCI Switch
        npci_total = len(npci_statuses)
        npci_successes = npci_statuses.count("SUCCESS")
        npci_success_rate = (npci_successes / npci_total) * 100.0
        npci_avg_latency = float(np.mean(npci_latencies)) if npci_latencies else 0.0

        set_npci_health({
            "health_score": round(npci_success_rate, 1),
            "success_rate": round(npci_success_rate, 1),
            "avg_latency_ms": round(npci_avg_latency, 1)
        })

    except Exception as e:
        logger.error(f"Error in health calculation run: {e}")
