import logging
import redis
import json
from datetime import datetime
from src.config import settings

logger = logging.getLogger("incident-engine.redis")

_redis_client = None

def get_redis_client():
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0
            )
            _redis_client.ping()
        except Exception as e:
            logger.warn(f"Redis is unavailable: {e}")
            _redis_client = None
    return _redis_client

def set_route_health(route_key: str, health: dict) -> None:
    client = get_redis_client()
    if not client:
        return
    try:
        key = f"route:health:{route_key}"
        client.hset(key, mapping={
            "route_key": route_key,
            "health_score": str(health["health_score"]),
            "success_rate": str(health["success_rate"]),
            "failure_rate": str(health["failure_rate"]),
            "p95_ms": str(health["p95_ms"]),
            "p99_ms": str(health["p99_ms"]),
            "timeout_rate": str(health["timeout_rate"]),
            "total_transactions": str(health["total_transactions"]),
            "last_updated": datetime.utcnow().isoformat() + "Z"
        })
    except Exception as e:
        logger.warn(f"Error setting route health in Redis: {e}")

def set_bank_health(bank_id: str, health: dict) -> None:
    client = get_redis_client()
    if not client:
        return
    try:
        key = f"bank:health:{bank_id}"
        client.hset(key, mapping={
            "bank_id": bank_id,
            "health_score": str(health["health_score"]),
            "sla_compliance": str(health["sla_compliance"]),
            "avg_latency_ms": str(health["avg_latency_ms"]),
            "active_incidents_count": str(health["active_incidents_count"]),
            "last_updated": datetime.utcnow().isoformat() + "Z"
        })
    except Exception as e:
        logger.warn(f"Error setting bank health in Redis: {e}")

def set_psp_health(psp_id: str, health: dict) -> None:
    client = get_redis_client()
    if not client:
        return
    try:
        key = f"psp:health:{psp_id}"
        client.hset(key, mapping={
            "psp_id": psp_id,
            "health_score": str(health["health_score"]),
            "success_rate": str(health["success_rate"]),
            "avg_latency_ms": str(health["avg_latency_ms"]),
            "last_updated": datetime.utcnow().isoformat() + "Z"
        })
    except Exception as e:
        logger.warn(f"Error setting PSP health in Redis: {e}")

def set_npci_health(health: dict) -> None:
    client = get_redis_client()
    if not client:
        return
    try:
        key = "npci:health"
        client.hset(key, mapping={
            "health_score": str(health["health_score"]),
            "success_rate": str(health["success_rate"]),
            "avg_latency_ms": str(health["avg_latency_ms"]),
            "last_updated": datetime.utcnow().isoformat() + "Z"
        })
    except Exception as e:
        logger.warn(f"Error setting NPCI health in Redis: {e}")
