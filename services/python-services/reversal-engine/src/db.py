import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import json
import uuid
from src.config import settings

logger = logging.getLogger("reversal-engine.db")

def get_db_connection():
    try:
        conn = psycopg2.connect(settings.DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None

def get_unprocessed_reversals() -> list:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        with conn.cursor() as cur:
            # Find transactions that failed but do not have a reversal prediction yet
            cur.execute(
                """SELECT t.id::text, t.amount, t.sender_bank, t.receiver_bank, t.psp_id, t.error_code, t.error_message
                   FROM transactions t
                   LEFT JOIN reversal_predictions r ON t.id = r.transaction_id
                   WHERE t.status = 'FAILED' AND r.id IS NULL"""
            )
            return [dict(row) for row in cur.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching unprocessed reversals: {e}")
        return []
    finally:
        conn.close()

def save_reversal_prediction(transaction_id: str, refund_eta: str, refund_eta_minutes: int, reversal_confidence: float, similar_cases: list = None, bank_behavior_note: str = None) -> bool:
    conn = get_db_connection()
    if not conn:
        return False
    pred_id = str(uuid.uuid4())
    try:
        similar_cases_json = json.dumps(similar_cases) if similar_cases else None
        with conn.cursor() as cur:
            # 1. Insert into reversal_predictions
            cur.execute(
                """INSERT INTO reversal_predictions (id, transaction_id, refund_eta, refund_eta_minutes, reversal_confidence, similar_cases, bank_behavior_note, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (pred_id, transaction_id, refund_eta, refund_eta_minutes, reversal_confidence, similar_cases_json, bank_behavior_note, datetime.utcnow())
            )
            # 2. Update transactions table
            cur.execute(
                """UPDATE transactions
                   SET expected_reversal = %s, reversal_confidence = %s
                   WHERE id = %s""",
                (refund_eta, reversal_confidence, transaction_id)
            )
            conn.commit()
            logger.info(f"Saved reversal prediction for txn {transaction_id}: ETA {refund_eta}")
            return True
    except Exception as e:
        logger.error(f"Error saving reversal prediction: {e}")
        return False
    finally:
        conn.close()
