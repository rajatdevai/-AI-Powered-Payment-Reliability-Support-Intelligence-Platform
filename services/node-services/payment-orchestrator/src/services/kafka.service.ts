import { Kafka, Producer, logLevel } from 'kafkajs';
import { env } from '../env';
import pino from 'pino';

const logger = pino({ name: 'kafka-service', level: env.LOG_LEVEL });

class KafkaService {
  private producer: Producer | null = null;
  private connected = false;

  async connect(): Promise<void> {
    if (!env.ENABLE_KAFKA) {
      logger.info('Kafka disabled (ENABLE_KAFKA=false). Events will be logged only.');
      return;
    }

    try {
      const kafka = new Kafka({
        clientId: 'payment-orchestrator',
        brokers: env.KAFKA_BROKERS.split(','),
        logLevel: logLevel.WARN,
        retry: { retries: 3, initialRetryTime: 300 },
      });

      this.producer = kafka.producer({
        idempotent: true,
        allowAutoTopicCreation: true,
      });

      await this.producer.connect();
      this.connected = true;
      logger.info({ brokers: env.KAFKA_BROKERS }, 'Kafka producer connected');
    } catch (err) {
      logger.warn({ err }, 'Kafka unavailable — events will be logged only');
      this.producer = null;
    }
  }

  async publish(topic: string, event: Record<string, unknown>): Promise<void> {
    const payload = {
      ...event,
      event_id: event['event_id'] ?? require('uuid').v4(),
      timestamp: event['timestamp'] ?? new Date().toISOString(),
      version: '1.0',
    };

    if (!this.producer || !this.connected) {
      // Graceful degradation: log the event instead
      logger.info({ topic, event: payload }, '[KAFKA-MOCK] Event published (no broker)');
      return;
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: (event['transaction_id'] as string) ?? null,
            value: JSON.stringify(payload),
          },
        ],
      });

      logger.debug({ topic, transaction_id: event['transaction_id'] }, 'Kafka event published');
    } catch (err) {
      logger.error({ topic, err }, 'Failed to publish Kafka event');
    }
  }

  async disconnect(): Promise<void> {
    if (this.producer && this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }
}

// Singleton
export const kafkaService = new KafkaService();
