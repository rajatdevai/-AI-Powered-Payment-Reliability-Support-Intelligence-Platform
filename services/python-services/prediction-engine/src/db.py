import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from src.config import settings

logger = logging.getLogger("prediction-engine.db")

def get_db_connection():
    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None

def get_active_incidents(route_key: str) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text, severity, description FROM incidents WHERE status = 'ACTIVE' AND route = %s",
                (route_key,)
            )
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching active incidents for route {route_key}: {e}")
        return []
    finally:
        conn.close()
