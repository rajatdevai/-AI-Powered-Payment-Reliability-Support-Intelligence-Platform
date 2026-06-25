import logging
import redis
import json
from src.config import settings

logger = logging.getLogger("agent-service.redis_iris")

_client = None

def get_redis_client():
    global _client
    if _client is None:
        try:
            _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2.0)
            _client.ping()
        except Exception as e:
            logger.warn(f"Redis IRIS unavailable: {e}")
            _client = None
    return _client

# Local fallback in-memory memory cache
_in_memory_memory = {}

def get_session_history(session_id: str) -> list:
    client = get_redis_client()
    if client:
        try:
            key = f"prism:session:{session_id}:context"
            data = client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warn(f"Failed to fetch session from Redis IRIS: {e}")
    return _in_memory_memory.get(session_id, [])

def save_session_history(session_id: str, history: list) -> bool:
    client = get_redis_client()
    if client:
        try:
            key = f"prism:session:{session_id}:context"
            client.setex(key, 86400, json.dumps(history)) # 24h TTL
            return True
        except Exception as e:
            logger.warn(f"Failed to save session to Redis IRIS: {e}")
    _in_memory_memory[session_id] = history
    return False

def clear_session_history(session_id: str) -> bool:
    client = get_redis_client()
    if client:
        try:
            key = f"prism:session:{session_id}:context"
            client.delete(key)
            return True
        except Exception as e:
            logger.warn(f"Failed to clear session from Redis IRIS: {e}")
    if session_id in _in_memory_memory:
        del _in_memory_memory[session_id]
        return True
    return False
