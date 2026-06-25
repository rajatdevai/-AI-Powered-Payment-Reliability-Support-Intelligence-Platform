"""
PRISM — Qdrant Seed Script
Creates collections and seeds baseline knowledge documents.

Prerequisites:
  pip install qdrant-client openai python-dotenv
  Qdrant running locally on port 6333

Usage:
  python seed.py

Environment:
  QDRANT_URL=http://localhost:6333
  OPENAI_API_KEY=sk-...  (for embedding generation)
"""

import json
import os
import uuid
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = "text-embedding-3-small"
VECTOR_SIZE = 1536

client = QdrantClient(url=QDRANT_URL)
openai_client = OpenAI(api_key=OPENAI_API_KEY)


def get_embedding(text: str) -> list[float]:
    """Generate embedding using OpenAI text-embedding-3-small."""
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def create_collection(name: str, size: int = VECTOR_SIZE) -> None:
    """Create a Qdrant collection if it does not exist."""
    existing = [c.name for c in client.get_collections().collections]
    if name in existing:
        print(f"  ⚠  Collection '{name}' already exists — skipping creation.")
        return

    client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=size, distance=Distance.COSINE),
    )
    print(f"  ✓  Collection '{name}' created.")


def upsert_documents(collection: str, docs: list[dict[str, Any]]) -> None:
    """Embed and upsert documents into a Qdrant collection."""
    points: list[PointStruct] = []
    for doc in docs:
        text = doc.pop("_embed_text")  # Text field used for embedding
        vector = get_embedding(text)
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload=doc,
            )
        )

    client.upsert(collection_name=collection, points=points)
    print(f"  ✓  {len(points)} documents upserted into '{collection}'.")


# ============================================================
# SEED: historical_failures
# ============================================================
HISTORICAL_FAILURES = [
    {
        "_embed_text": "NPCI issuer timeout socket hang up HDFC gateway did not respond within 5 seconds",
        "error_code": "NPCI_ISSUER_TIMEOUT",
        "error_message": "Issuer bank gateway timeout during execution",
        "root_cause": "HDFC Issuer Bank Gateway Timeout",
        "affected_component": "Sender Bank",
        "sender_bank": "HDFC",
        "receiver_bank": "SBI",
        "amount_range": "5000-10000",
        "resolution": "Transaction auto-reversed within 14 minutes. No customer action required.",
        "resolution_time_minutes": 14,
        "date": "2024-01-10",
    },
    {
        "_embed_text": "Acquirer bank 503 service unavailable SBI receiver bank outage connection refused",
        "error_code": "ACQUIRER_503_OUTAGE",
        "error_message": "Acquirer bank 503 Service Unavailable",
        "root_cause": "SBI Acquirer Bank Outage",
        "affected_component": "Receiver Bank",
        "sender_bank": "ICICI",
        "receiver_bank": "SBI",
        "amount_range": "1000-5000",
        "resolution": "Funds held at NPCI. Reversal initiated after 3-hour SLA window.",
        "resolution_time_minutes": 180,
        "date": "2024-01-08",
    },
    {
        "_embed_text": "PSP decryption signature mismatch error Razorpay encryption failure checksum invalid",
        "error_code": "PSP_DECRYPTION_FAULT",
        "error_message": "PSP decryption signature mismatch error",
        "root_cause": "PSP Signature Mismatch",
        "affected_component": "PSP Gateway",
        "sender_bank": "HDFC",
        "receiver_bank": "AXIS",
        "amount_range": "100-1000",
        "resolution": "Retry succeeded within 4 minutes. PSP auto-corrected encryption key.",
        "resolution_time_minutes": 4,
        "date": "2024-01-05",
    },
    {
        "_embed_text": "Network routing handshake timeout latency congestion spike intermediary router slow",
        "error_code": "NET_CONGESTION_SPIKE",
        "error_message": "Network routing handshake timeout latency",
        "root_cause": "Network Congestion Spike",
        "affected_component": "Intermediary Router",
        "sender_bank": "AXIS",
        "receiver_bank": "ICICI",
        "amount_range": "any",
        "resolution": "Transaction retried successfully after 18-minute congestion window cleared.",
        "resolution_time_minutes": 18,
        "date": "2024-01-03",
    },
    {
        "_embed_text": "NPCI switch down maintenance window UPI service unavailable all banks affected",
        "error_code": "NPCI_SWITCH_DOWN",
        "error_message": "NPCI switch unavailable — scheduled maintenance",
        "root_cause": "NPCI Switch Maintenance",
        "affected_component": "NPCI Switch",
        "sender_bank": "ALL",
        "receiver_bank": "ALL",
        "amount_range": "any",
        "resolution": "All transactions pending during window auto-processed post-maintenance.",
        "resolution_time_minutes": 45,
        "date": "2024-01-01",
    },
]

# ============================================================
# SEED: playbooks
# ============================================================
PLAYBOOKS = [
    {
        "_embed_text": "What to tell a customer when their payment failed due to bank timeout refund process",
        "playbook_id": "PB-001",
        "title": "Customer Communication — Bank Timeout Failure",
        "category": "CUSTOMER_SUPPORT",
        "content": (
            "1. Acknowledge the failure immediately with empathy.\n"
            "2. Confirm that no money has been debited permanently.\n"
            "3. Inform the customer that if debited, the refund will arrive within 14 minutes.\n"
            "4. Do NOT ask the customer to retry on the same route.\n"
            "5. Suggest switching to an alternative bank if route health is below 80.\n"
            "6. Log a support case if the customer calls back within 1 hour."
        ),
        "applicable_error_codes": ["NPCI_ISSUER_TIMEOUT", "NPCI_SWITCH_DOWN"],
        "last_updated": "2024-01-01",
        "version": "1.2",
    },
    {
        "_embed_text": "Escalation procedure for critical incident affecting multiple users large blast radius",
        "playbook_id": "PB-002",
        "title": "Critical Incident Escalation SOP",
        "category": "INCIDENT_MANAGEMENT",
        "content": (
            "1. Confirm incident severity is CRITICAL (>50% failure rate or >10,000 affected users).\n"
            "2. Immediately escalate to the on-call payment ops engineer.\n"
            "3. Notify the affected bank's technical support team.\n"
            "4. Enable proactive outreach for high-value customers (>₹10,000 transactions).\n"
            "5. Do not close the incident until failure rate returns below 5%.\n"
            "6. Post-incident review required within 48 hours."
        ),
        "applicable_error_codes": ["ACQUIRER_503_OUTAGE", "NPCI_SWITCH_DOWN"],
        "last_updated": "2024-01-01",
        "version": "2.0",
    },
    {
        "_embed_text": "Refund timeline how long does it take for money to come back after failed transaction",
        "playbook_id": "PB-003",
        "title": "Refund Timeline Reference Guide",
        "category": "CUSTOMER_SUPPORT",
        "content": (
            "Standard reversal timelines by error type:\n"
            "- NPCI_ISSUER_TIMEOUT: 14 minutes (88% confidence)\n"
            "- PSP_DECRYPTION_FAULT: 4 minutes (92% confidence)\n"
            "- NET_CONGESTION_SPIKE: 18 minutes (81% confidence)\n"
            "- ACQUIRER_503_OUTAGE: 3 hours (76% confidence)\n"
            "- Unknown/General: 1 business day (60% confidence)\n\n"
            "If reversal not received within 2x the estimated window: escalate to bank ops."
        ),
        "applicable_error_codes": ["ALL"],
        "last_updated": "2024-01-01",
        "version": "1.0",
    },
]


def main() -> None:
    print("🌱 Seeding Qdrant collections...\n")

    collections = ["historical_failures", "rca_reports", "playbooks", "incident_knowledge"]
    for col in collections:
        create_collection(col)

    print("\n📝 Seeding documents...\n")
    upsert_documents("historical_failures", HISTORICAL_FAILURES)
    upsert_documents("playbooks", PLAYBOOKS)

    print("\n✅ Qdrant seed complete.")
    print(f"   Connect to Qdrant dashboard: {QDRANT_URL}/dashboard")


if __name__ == "__main__":
    main()
