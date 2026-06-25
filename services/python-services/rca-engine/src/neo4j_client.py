import logging
from src.config import settings

logger = logging.getLogger("rca-engine.neo4j")

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
            logger.info("Neo4j client successfully connected.")
except Exception as e:
    logger.warn(f"Neo4j client is operating in fallback/MOCK mode: {e}")

def get_topology_path(sender_bank: str, receiver_bank: str, psp: str) -> list:
    # Try querying Neo4j if available
    if _driver:
        try:
            with _driver.session() as session:
                query = """
                MATCH (s:Bank {code: $sender})-[r1:ROUTES_TO]->(n:NPCI)-[r2:ROUTES_TO]->(r:Bank {code: $receiver})
                RETURN s.name as sender, n.name as switch, r.name as receiver
                """
                res = session.run(query, sender=sender_bank, receiver=receiver_bank)
                record = res.single()
                if record:
                    return [record["sender"], record["switch"], record["receiver"]]
        except Exception as e:
            logger.warn(f"Neo4j query failed: {e}. Falling back to default mock path.")
            
    # Mock fallback path
    return [sender_bank, "NPCI_SWITCH", receiver_bank]
