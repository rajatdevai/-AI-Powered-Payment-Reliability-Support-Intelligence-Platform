import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from src.config import settings

logger = logging.getLogger("blast-radius-engine.db")

def get_db_connection():
    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None

def get_unprocessed_incidents() -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            # Find active incidents that do not have blast_radius populated yet
            cur.execute(
                """SELECT id::text, route, severity, status, description, created_at
                   FROM incidents
                   WHERE status = 'ACTIVE' AND blast_radius IS NULL"""
            )
            return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching unprocessed incidents: {e}")
        return []
    finally:
        conn.close()

def save_blast_radius(incident_id: str, blast_radius: dict, affected_users_count: int, affected_merchants_count: int) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        blast_radius_json = json.dumps(blast_radius)
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE incidents
                   SET blast_radius = %s, affected_users_count = %s, affected_merchants_count = %s
                   WHERE id = %s""",
                (blast_radius_json, affected_users_count, affected_merchants_count, incident_id)
            )
            conn.commit()
            logger.info(f"Saved blast radius for incident {incident_id}")
            return True
    except Exception as e:
        logger.error(f"Error saving blast radius: {e}")
        return False
    finally:
        conn.close()
