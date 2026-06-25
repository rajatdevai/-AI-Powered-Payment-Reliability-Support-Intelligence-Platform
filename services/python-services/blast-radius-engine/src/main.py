import asyncio
import logging
import sys
import os

# Add the parent directory to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.config import settings
from src.db import get_unprocessed_incidents, save_blast_radius
from src.neo4j_client import traverse_blast_radius

# Setup logging
logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("blast-radius-engine.main")

async def blast_radius_worker():
    logger.info("Blast Radius Engine Worker loop started (5s interval)...")
    while True:
        try:
            incidents = get_unprocessed_incidents()
            for inc in incidents:
                inc_id = inc["id"]
                logger.info(f"Processing blast radius for incident {inc_id} route {inc['route']}")

                br = traverse_blast_radius(inc["route"])

                saved = save_blast_radius(
                    incident_id=inc_id,
                    blast_radius=br,
                    affected_users_count=br["affected_users_count"],
                    affected_merchants_count=len(br["affected_merchants"])
                )

                if saved:
                    # Simulate publishing blast_radius.calculated to Kafka
                    logger.info(f"[KAFKA] Event blast_radius.calculated published for incident {inc_id}")

        except Exception as e:
            logger.error(f"Error in Blast Radius worker cycle: {e}")

        await asyncio.sleep(5)

async def main():
    await blast_radius_worker()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down blast-radius-engine...")
