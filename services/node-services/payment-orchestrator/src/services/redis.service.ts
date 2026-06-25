import Redis from 'ioredis';
import pino from 'pino';
import { env } from '../env';

const logger = pino({ name: 'redis-service', level: env.LOG_LEVEL });

let redis: Redis | null = null;

export async function connectRedis(): Promise<void> {
  try {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    redis.on('error', (err) => {
      logger.warn({ err }, 'Redis connection error — operating without cache');
    });

    await redis.ping();
    logger.info({ url: env.REDIS_URL }, 'Redis connected');
  } catch (err) {
    logger.warn({ err }, 'Redis unavailable — predictions will not be cached');
    redis = null;
  }
}

export function getRedis(): Redis | null {
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}

// ============================================================
// Route Health
// ============================================================

export interface CachedRouteHealth {
  route_key: string;
  health_score: number;
  success_rate: number;
  failure_rate: number;
  p95_ms: number;
  p99_ms: number;
  timeout_rate: number;
  total_transactions: number;
}

export async function getRouteHealthFromRedis(
  routeKey: string
): Promise<CachedRouteHealth | null> {
  if (!redis) return null;

  try {
    const raw = await redis.hgetall(`route:health:${routeKey}`);
    if (!raw || !raw['health_score']) return null;

    return {
      route_key: raw['route_key'] ?? routeKey,
      health_score: parseFloat(raw['health_score'] ?? '95'),
      success_rate: parseFloat(raw['success_rate'] ?? '95'),
      failure_rate: parseFloat(raw['failure_rate'] ?? '5'),
      p95_ms: parseFloat(raw['p95_ms'] ?? '400'),
      p99_ms: parseFloat(raw['p99_ms'] ?? '1200'),
      timeout_rate: parseFloat(raw['timeout_rate'] ?? '2'),
      total_transactions: parseInt(raw['total_transactions'] ?? '100'),
    };
  } catch {
    return null;
  }
}

export async function setRouteHealth(
  routeKey: string,
  health: Omit<CachedRouteHealth, 'route_key'>
): Promise<void> {
  if (!redis) return;

  try {
    await redis.hset(`route:health:${routeKey}`, {
      route_key: routeKey,
      health_score: health.health_score.toString(),
      success_rate: health.success_rate.toString(),
      failure_rate: health.failure_rate.toString(),
      p95_ms: health.p95_ms.toString(),
      p99_ms: health.p99_ms.toString(),
      timeout_rate: health.timeout_rate.toString(),
      total_transactions: health.total_transactions.toString(),
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err, routeKey }, 'Failed to set route health in Redis');
  }
}

// ============================================================
// Bank Health
// ============================================================

export interface CachedBankHealth {
  bank_id: string;
  health_score: number;
  sla_compliance: number;
  avg_latency_ms: number;
  active_incidents_count: number;
}

export async function getBankHealthFromRedis(
  bankCode: string
): Promise<CachedBankHealth | null> {
  if (!redis) return null;

  try {
    const raw = await redis.hgetall(`bank:health:${bankCode}`);
    if (!raw || !raw['health_score']) return null;

    return {
      bank_id: raw['bank_id'] ?? bankCode,
      health_score: parseFloat(raw['health_score'] ?? '95'),
      sla_compliance: parseFloat(raw['sla_compliance'] ?? '99'),
      avg_latency_ms: parseFloat(raw['avg_latency_ms'] ?? '200'),
      active_incidents_count: parseInt(raw['active_incidents_count'] ?? '0'),
    };
  } catch {
    return null;
  }
}

export async function setBankHealth(
  bankCode: string,
  health: Omit<CachedBankHealth, 'bank_id'>
): Promise<void> {
  if (!redis) return;

  try {
    await redis.hset(`bank:health:${bankCode}`, {
      bank_id: bankCode,
      health_score: health.health_score.toString(),
      sla_compliance: health.sla_compliance.toString(),
      avg_latency_ms: health.avg_latency_ms.toString(),
      active_incidents_count: health.active_incidents_count.toString(),
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err, bankCode }, 'Failed to set bank health in Redis');
  }
}
