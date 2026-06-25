import logging
import json
import uuid
from datetime import datetime
from src.config import settings

logger = logging.getLogger("incident-engine.kafka")

_producer = None

try:
    from confluent_kafka import Producer
    # Initialize Kafka Producer if enabled
    if settings.ENABLE_KAFKA:
        _producer = Producer({
            'bootstrap.servers': settings.KAFKA_BROKERS,
            'socket.timeout.ms': 2000,
            'message.timeout.ms': 3000,
        })
        logger.info(f"Kafka producer initialized on brokers: {settings.KAFKA_BROKERS}")
except ImportError:
    logger.warn("confluent-kafka package not found. Kafka integration will operate in MOCK/fallback mode.")
except Exception as e:
    logger.warn(f"Failed to connect to Kafka brokers. Fallback to MOCK: {e}")

def publish_event(topic: str, event_data: dict) -> None:
    event_data["event_id"] = event_data.get("event_id", str(uuid.uuid4()))
    event_data["timestamp"] = event_data.get("timestamp", datetime.utcnow().isoformat() + "Z")
    event_data["version"] = "1.0"

    logger.info(f"Publishing to topic '{topic}': {json.dumps(event_data)}")

    if _producer and settings.ENABLE_KAFKA:
        try:
            _producer.produce(
                topic,
                key=event_data["correlation_id"],
                value=json.dumps(event_data).encode('utf-8')
            )
            # Flush in background asynchronously
            _producer.poll(0)
        except Exception as e:
            logger.warn(f"Failed to send Kafka message to topic {topic}: {e}")
    else:
        logger.info(f"[MOCK KAFKA] Successfully simulated publishing to {topic}")

def publish_incident_created(incident_id: str, route: str, severity: str, description: str, metric: str, val: float) -> None:
    publish_event("incident.created", {
        "event_type": "incident.created",
        "correlation_id": incident_id,
        "incident_id": incident_id,
        "route": route,
        "severity": severity,
        "description": description,
        "trigger_metric": metric,
        "trigger_value": val
    })

def publish_incident_resolved(incident_id: str, route: str, reason: str, duration_min: float) -> None:
    publish_event("incident.resolved", {
        "event_type": "incident.resolved",
        "correlation_id": incident_id,
        "incident_id": incident_id,
        "route": route,
        "resolved_reason": reason,
        "duration_minutes": float(duration_min)
    })
