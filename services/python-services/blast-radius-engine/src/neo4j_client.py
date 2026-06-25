import logging
from src.config import settings

logger = logging.getLogger("blast-radius-engine.neo4j")

_driver = None

try:
    from neo4j import GraphDatabase
    def init_driver():
        global _driver
        if _driver is None:
            _driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
            )
            # test connectivity
            with _driver.session() as session:
                session.run("RETURN 1")
            logger.info("Neo4j client connected.")
except Exception as e:
    logger.warn(f"Neo4j client operating in fallback/MOCK mode: {e}")

def traverse_blast_radius(route_key: str) -> dict:
    if _driver:
        try:
            with _driver.session() as session:
                # Query merchants, PSPs, and banks connected to the degraded route in Neo4j
                pass
        except Exception as e:
            logger.warn(f"Neo4j query failed: {e}. Using mock fallback.")
            
    # Mock fallback blast radius calculation
    parts = route_key.split("_")
    sender = parts[0] if len(parts) > 0 else "UNKNOWN"
    receiver = parts[1] if len(parts) > 1 else "UNKNOWN"

    return {
        "affected_routes": [route_key],
        "affected_banks": [sender, receiver],
        "affected_psps": ["RAZORPAY", "PAYU"],
        "affected_merchants": ["AMAZON_IN", "SWIGGY", "ZOMATO"],
        "affected_users_count": 250,
        "estimated_txn_impact": 1200
    }
