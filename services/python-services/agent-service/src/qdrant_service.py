import logging
from src.config import settings

logger = logging.getLogger("agent-service.qdrant")

_qdrant_client = None

try:
    from qdrant_client import QdrantClient
    def get_client():
        global _qdrant_client
        if _qdrant_client is None:
            _qdrant_client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
            _qdrant_client.get_collections()
            logger.info("Qdrant client connected.")
        return _qdrant_client
except Exception as e:
    logger.warn(f"Qdrant client operating in MOCK/fallback mode: {e}")

MOCK_SOPS = [
    {
        "title": "UPI Reversal SLA Policy",
        "content": "For UPI transaction timeouts at the issuer bank, an auto-reversal is triggered. Funds are reversed back to the sender bank account within 15 minutes of failure. If not resolved, a dispute is logged at the NPCI level."
    },
    {
        "title": "Acquirer PSP Degradation Policy",
        "content": "If the acquirer PSP reports HTTP 503 or network issues, transaction reconciliation is suspended. Transactions are cleared in batches every 2 hours, after which status is finalized and refunds are pushed."
    },
    {
        "title": "Crypto Handshake Failure Policy",
        "content": "Crypto handshake decryption errors or signature mismatches lead to immediate payment rejection. Ledger entries are not updated at the core banking level, and refunds are credited back in 5 minutes."
    }
]

def search_knowledge_base(query: str) -> list:
    client = None
    try:
        client = get_client()
    except Exception:
        pass

    if client:
        try:
            # Query Qdrant
            pass
        except Exception as e:
            logger.warn(f"Qdrant query failed: {e}")
            
    # Mock RAG matching
    q_upper = query.upper()
    matches = []
    for sop in MOCK_SOPS:
        # Match keywords
        keywords = sop["title"].upper().split() + ["REVERSAL", "TIMEOUT", "503", "SIGNATURE", "DECRYPTION"]
        if any(k in q_upper for k in keywords):
            matches.append(sop)
            
    return matches if matches else MOCK_SOPS
