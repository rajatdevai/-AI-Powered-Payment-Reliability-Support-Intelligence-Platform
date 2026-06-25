import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from src.config import settings
from typing import Optional

logger = logging.getLogger("agent-service.db")

def get_db_connection():
    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None

def get_transaction_context(transaction_id: str) -> dict:
    conn = get_db_connection()
    if not conn:
        return {}
    try:
        with conn.cursor() as cur:
            # Query transaction along with RCA and Reversal predictions
            cur.execute(
                """SELECT 
                     t.id::text, t.amount, t.currency, t.sender_bank, t.receiver_bank, t.psp_id, t.merchant_id::text, t.status, t.route_path, t.latency_ms, t.error_code, t.error_message, t.created_at,
                     r.root_cause, r.affected_component, r.confidence as rca_confidence,
                     rev.refund_eta, rev.reversal_confidence
                   FROM transactions t
                   LEFT JOIN rca_reports r ON t.id = r.transaction_id
                   LEFT JOIN reversal_predictions rev ON t.id = rev.transaction_id
                   WHERE t.id = %s""",
                (transaction_id,)
            )
            row = cur.fetchone()
            return dict(row) if row else {}
    except Exception as e:
        logger.error(f"Error fetching transaction context: {e}")
        return {}
    finally:
        conn.close()

def get_incident_context(incident_id: str) -> dict:
    conn = get_db_connection()
    if not conn:
        return {}
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text, route, severity, status, description, created_at, blast_radius FROM incidents WHERE id = %s",
                (incident_id,)
            )
            row = cur.fetchone()
            return dict(row) if row else {}
    except Exception as e:
        logger.error(f"Error fetching incident context: {e}")
        return {}
    finally:
        conn.close()

def get_latest_failed_transaction(limit: int = 1) -> Optional[dict]:
    """
    Fetch the most recent FAILED or TIMEOUT transaction joined with RCA and reversal data.
    Used by the context builder when no explicit transaction_id is supplied by the caller.
    """
    conn = get_db_connection()
    if not conn:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    t.id::text,
                    t.amount,
                    t.currency,
                    t.sender_bank,
                    t.receiver_bank,
                    t.psp_id,
                    t.merchant_id::text,
                    t.status,
                    t.route_path,
                    t.latency_ms,
                    t.error_code,
                    t.error_message,
                    t.created_at,
                    r.root_cause,
                    r.affected_component,
                    r.confidence          AS rca_confidence,
                    r.llm_summary         AS rca_llm_summary,
                    rev.refund_eta,
                    rev.reversal_confidence,
                    rev.bank_behavior_note
                FROM transactions t
                LEFT JOIN rca_reports   r   ON t.id = r.transaction_id
                LEFT JOIN reversal_predictions rev ON t.id = rev.transaction_id
                WHERE t.status IN ('FAILED', 'TIMEOUT')
                ORDER BY t.created_at DESC
                LIMIT %s
                """,
                (limit,)
            )
            row = cur.fetchone()
            return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error fetching latest failed transaction: {e}")
        return None
    finally:
        conn.close()

def get_recent_transactions(limit: int = 5) -> list:
    """
    Fetch the N most recent transactions (any status) for context enrichment.
    """
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    t.id::text,
                    t.amount,
                    t.currency,
                    t.sender_bank,
                    t.receiver_bank,
                    t.status,
                    t.error_code,
                    t.error_message,
                    t.created_at,
                    rev.refund_eta
                FROM transactions t
                LEFT JOIN reversal_predictions rev ON t.id = rev.transaction_id
                ORDER BY t.created_at DESC
                LIMIT %s
                """,
                (limit,)
            )
            rows = cur.fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Error fetching recent transactions: {e}")
        return []
    finally:
        conn.close()
