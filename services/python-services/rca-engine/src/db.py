import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import json
import uuid
from src.config import settings

logger = logging.getLogger("rca-engine.db")

def get_db_connection():
    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None

def get_unprocessed_failures() -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            # Find transactions that failed but do not have an RCA report yet
            cur.execute(
                """SELECT t.id::text, t.amount, t.sender_bank, t.receiver_bank, t.psp_id, t.error_code, t.error_message
                   FROM transactions t
                   LEFT JOIN rca_reports r ON t.id = r.transaction_id
                   WHERE t.status = 'FAILED' AND r.id IS NULL"""
            )
            return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching unprocessed failures: {e}")
        return []
    finally:
        conn.close()

def save_rca_report(transaction_id: str, root_cause: str, affected_component: str, confidence: float, evidence: dict, llm_summary: str = None) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    report_id = str(uuid.uuid4())
    try:
        evidence_json = json.dumps(evidence)
        with conn.cursor() as cur:
            # 1. Insert into rca_reports
            cur.execute(
                """INSERT INTO rca_reports (id, transaction_id, root_cause, affected_component, confidence, evidence, llm_summary, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (report_id, transaction_id, root_cause, affected_component, confidence, evidence_json, llm_summary, datetime.utcnow())
            )
            # 2. Update transaction table fields
            cur.execute(
                """UPDATE transactions
                   SET root_cause = %s, affected_component = %s, rca_confidence = %s
                   WHERE id = %s""",
                (root_cause, affected_component, confidence, transaction_id)
            )
            conn.commit()
            logger.info(f"Saved RCA report for txn {transaction_id} component {affected_component}")
            return True
    except Exception as e:
        logger.error(f"Error saving RCA report: {e}")
        return False
    finally:
        conn.close()
