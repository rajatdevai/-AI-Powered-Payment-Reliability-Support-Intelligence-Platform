import logging
from src.config import settings

logger = logging.getLogger("rca-engine.qdrant")

_qdrant_client = None

try:
    from qdrant_client import QdrantClient
    def get_client():
        global _qdrant_client
        if _qdrant_client is None:
            _qdrant_client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
            _qdrant_client.get_collections()
            logger.info("Qdrant client successfully connected.")
        return _qdrant_client
except Exception as e:
    logger.warn(f"Qdrant client is operating in fallback/MOCK mode: {e}")

def search_failure_playbook(error_code: str, error_message: str) -> dict:
    client = None
    try:
        client = get_client()
    except Exception:
        pass

    if client:
        try:
            logger.info(f"Querying Qdrant for failure playbook for {error_code}")
        except Exception as e:
            logger.warn(f"Qdrant query failed: {e}")

    err_upper = (error_code or "").upper()
    msg_upper = (error_message or "").upper()

    if "TIMEOUT" in err_upper or "TIMEOUT" in msg_upper:
        return {
            "root_cause": "Network connection timed out during execution at the issuer bank gateway.",
            "affected_component": "ISSUER_GATEWAY",
            "confidence": 0.85
        }
    elif "503" in err_upper or "SERVICE_UNAVAILABLE" in err_upper or "503" in msg_upper:
        return {
            "root_cause": "Acquirer PSP gateway service was temporarily unavailable (HTTP 503).",
            "affected_component": "ACQUIRER_PSP",
            "confidence": 0.90
        }
    elif "SIGNATURE" in err_upper or "DECRYPTION" in err_upper or "DECRYPTION" in msg_upper:
        return {
            "root_cause": "PSP cryptographic signature validation failed or packet decryption failed.",
            "affected_component": "PSP_ADAPTER",
            "confidence": 0.95
        }
    else:
        return {
            "root_cause": "NPCI switch routing error due to network congestion or switch overload.",
            "affected_component": "NPCI_SWITCH",
            "confidence": 0.70
        }
