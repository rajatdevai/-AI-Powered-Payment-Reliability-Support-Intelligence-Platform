import asyncio
import logging
import sys
import os

# Add the parent directory to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.config import settings
from src.db import get_unprocessed_reversals, save_reversal_prediction

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("reversal-engine.main")

def calculate_reversal_eta(error_code: str, error_message: str, bank: str) -> dict:
    err_upper = (error_code or "").upper()
    msg_upper = (error_message or "").upper()

    # Rule based reversal ETA estimation
    if "TIMEOUT" in err_upper or "TIMEOUT" in msg_upper:
        return {
            "refund_eta": "15 minutes",
            "refund_eta_minutes": 15,
            "reversal_confidence": 95.0,
            "bank_behavior_note": f"Automatic reversal trigger detected for {bank}. Latency profile matches auto-refund webhook execution."
        }
    elif "503" in err_upper or "SERVICE_UNAVAILABLE" in err_upper or "503" in msg_upper:
        return {
            "refund_eta": "2 hours",
            "refund_eta_minutes": 120,
            "reversal_confidence": 80.0,
            "bank_behavior_note": f"Acquirer gateway degradation requires clearing file reconciliation before settlement."
        }
    elif "SIGNATURE" in err_upper or "DECRYPTION" in err_upper or "DECRYPTION" in msg_upper:
        return {
            "refund_eta": "5 minutes",
            "refund_eta_minutes": 5,
            "reversal_confidence": 99.0,
            "bank_behavior_note": f"Handshake decryption fault. Transaction was aborted before core banking ledger hit. Immediate refund."
        }
    else:
        return {
            "refund_eta": "24 hours",
            "refund_eta_minutes": 1440,
            "reversal_confidence": 90.0,
            "bank_behavior_note": f"Manual reconciliation or bank switch dispute settlement file processing required."
        }

async def reversal_worker():
    logger.info("Reversal Engine Worker loop started (5s interval)...")
    while True:
        try:
            reversals = get_unprocessed_reversals()
            for tx in reversals:
                tx_id = tx["id"]
                logger.info(f"Processing reversal for transaction {tx_id}")

                eta_data = calculate_reversal_eta(
                    tx["error_code"],
                    tx["error_message"],
                    tx["sender_bank"]
                )

                saved = save_reversal_prediction(
                    transaction_id=tx_id,
                    refund_eta=eta_data["refund_eta"],
                    refund_eta_minutes=eta_data["refund_eta_minutes"],
                    reversal_confidence=eta_data["reversal_confidence"],
                    similar_cases=[],
                    bank_behavior_note=eta_data["bank_behavior_note"]
                )

                if saved:
                    # Simulate publishing reversal.predicted to Kafka
                    logger.info(f"[KAFKA] Event reversal.predicted published for transaction {tx_id}")

        except Exception as e:
            logger.error(f"Error in Reversal worker cycle: {e}")

        await asyncio.sleep(5)

async def main():
    await reversal_worker()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down reversal-engine...")
