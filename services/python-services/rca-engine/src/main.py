import asyncio
import logging
import uuid
import sys
import os
from datetime import datetime

# Add the parent directory to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.config import settings
from src.db import get_unprocessed_failures, save_rca_report
from src.neo4j_client import get_topology_path
from src.qdrant_service import search_failure_playbook

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("rca-engine.main")

async def rca_worker():
    logger.info("RCA Engine Worker loop started (5s interval)...")
    while True:
        try:
            failures = get_unprocessed_failures()
            for tx in failures:
                tx_id = tx["id"]
                logger.info(f"Processing failure for transaction {tx_id}")

                # 1. Neo4j Topology Path
                path = get_topology_path(tx["sender_bank"], tx["receiver_bank"], tx["psp_id"])

                # 2. Qdrant Playbook Match
                playbook = search_failure_playbook(tx["error_code"], tx["error_message"])

                # 3. Compile Evidence
                evidence = {
                    "neo4j_path": path,
                    "qdrant_matches": [
                        {
                            "document_id": str(uuid.uuid4()),
                            "score": playbook["confidence"],
                            "summary": playbook["root_cause"]
                        }
                    ],
                    "error_pattern": tx["error_code"],
                    "frequency": 1
                }

                # 4. Save Report to Database & update transaction
                saved = save_rca_report(
                    transaction_id=tx_id,
                    root_cause=playbook["root_cause"],
                    affected_component=playbook["affected_component"],
                    confidence=playbook["confidence"],
                    evidence=evidence,
                    llm_summary=f"Automated RCA Analysis: Identified issue in {playbook['affected_component']} with {int(playbook['confidence'] * 100)}% confidence."
                )

                if saved:
                    # Simulate publishing rca.generated to Kafka
                    logger.info(f"[KAFKA] Event rca.generated published for transaction {tx_id}")

        except Exception as e:
            logger.error(f"Error in RCA worker cycle: {e}")

        await asyncio.sleep(5)

async def main():
    await rca_worker()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down rca-engine...")
