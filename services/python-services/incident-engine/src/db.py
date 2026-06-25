import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
import uuid
from src.config import settings

logger = logging.getLogger("incident-engine.db")

def get_db_connection():
    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None

def get_active_incidents(route: str = None) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            if route:
                cur.execute(
                    "SELECT id::text, route, severity, status, description, created_at, affected_users_count FROM incidents WHERE status = 'ACTIVE' AND route = %s",
                    (route,)
                )
            else:
                cur.execute(
                    "SELECT id::text, route, severity, status, description, created_at, affected_users_count FROM incidents WHERE status = 'ACTIVE'"
                )
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching active incidents: {e}")
        return []
    finally:
        conn.close()

def get_incident_by_id(incident_id: str) -> dict:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text, route, severity, status, description, root_cause, created_at, resolved_at, affected_users_count, affected_merchants_count, blast_radius FROM incidents WHERE id = %s",
                (incident_id,)
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error fetching incident details: {e}")
        return None
    finally:
        conn.close()

def create_incident(route: str, severity: str, description: str, blast_radius: dict = None) -> str:
    conn = get_db_connection()
    if not conn:
        return None
    incident_id = str(uuid.uuid4())
    try:
        import json
        blast_radius_json = json.dumps(blast_radius) if blast_radius else None
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO incidents (id, route, severity, status, description, blast_radius, created_at)
                   VALUES (%s, %s, %s, 'ACTIVE', %s, %s, %s)""",
                (incident_id, route, severity, description, blast_radius_json, datetime.utcnow())
            )
            conn.commit()
            logger.info(f"Created active incident {incident_id} for route {route}")
            return incident_id
    except Exception as e:
        logger.error(f"Error creating incident: {e}")
        return None
    finally:
        conn.close()

def resolve_incident(incident_id: str, resolved_reason: str) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE incidents 
                   SET status = 'RESOLVED', resolved_at = %s, root_cause = %s
                   WHERE id = %s AND status = 'ACTIVE'""",
                (datetime.utcnow(), resolved_reason, incident_id)
            )
            conn.commit()
            logger.info(f"Resolved incident {incident_id}")
            return True
    except Exception as e:
        logger.error(f"Error resolving incident: {e}")
        return False
    finally:
        conn.close()

def get_recent_transactions(window_seconds: int = 300) -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cutoff = datetime.utcnow() - timedelta(seconds=window_seconds)
        with conn.cursor() as cur:
            cur.execute(
                """SELECT 
                     id::text,
                     amount,
                     sender_bank,
                     receiver_bank,
                     psp_id,
                     status,
                     latency_ms,
                     created_at
                   FROM transactions
                   WHERE created_at >= %s""",
                (cutoff,)
            )
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching recent transactions: {e}")
        return []
    finally:
        conn.close()
