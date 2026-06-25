import json
import logging
import redis
from src.config import settings

logger = logging.getLogger("prediction-engine.redis")

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

def get_route_health(route_key: str) -> dict:
    client = get_redis_client()
    if not client:
        return None
    try:
        data = client.hgetall(f"route:health:{route_key}")
        if not data or "health_score" not in data:
            return None
        return {
            "route_key": data.get("route_key", route_key),
            "health_score": float(data.get("health_score", 95)),
            "success_rate": float(data.get("success_rate", 95)),
            "failure_rate": float(data.get("failure_rate", 5)),
            "p95_ms": float(data.get("p95_ms", 400)),
            "p99_ms": float(data.get("p99_ms", 1200)),
            "timeout_rate": float(data.get("timeout_rate", 2)),
            "total_transactions": int(data.get("total_transactions", 100)),
            "last_updated": data.get("last_updated", "")
        }
    except Exception as e:
        logger.warn(f"Error fetching route health from Redis: {e}")
        return None

def get_bank_health(bank_code: str) -> dict:
    client = get_redis_client()
    if not client:
        return None
    try:
        data = client.hgetall(f"bank:health:{bank_code}")
        if not data or "health_score" not in data:
            return None
        return {
            "bank_id": data.get("bank_id", bank_code),
            "health_score": float(data.get("health_score", 95)),
            "sla_compliance": float(data.get("sla_compliance", 99)),
            "avg_latency_ms": float(data.get("avg_latency_ms", 200)),
            "active_incidents_count": int(data.get("active_incidents_count", 0)),
            "last_updated": data.get("last_updated", "")
        }
    except Exception as e:
        logger.warn(f"Error fetching bank health from Redis: {e}")
        return None

def get_cached_prediction(sender_bank: str, receiver_bank: str, amount: float) -> dict:
    client = get_redis_client()
    if not client:
        return None
    try:
        key = f"prediction:cache:{sender_bank}:{receiver_bank}:{amount}"
        val = client.get(key)
        if val:
            return json.loads(val)
    except Exception as e:
        logger.warn(f"Error reading prediction cache from Redis: {e}")
    return None

def set_cached_prediction(sender_bank: str, receiver_bank: str, amount: float, prediction: dict) -> None:
    client = get_redis_client()
    if not client:
        return
    try:
        key = f"prediction:cache:{sender_bank}:{receiver_bank}:{amount}"
        client.setex(key, 30, json.dumps(prediction)) # 30s TTL
    except Exception as e:
        logger.warn(f"Error writing prediction cache to Redis: {e}")
