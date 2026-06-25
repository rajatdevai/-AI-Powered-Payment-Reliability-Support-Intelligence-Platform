/**
 * PRISM — Seed Script
 *
 * Seeds:
 *  1. 1000 historical transactions in PostgreSQL (realistic distribution)
 *  2. Route health scores in Redis (20 routes)
 *  3. Bank health scores in Redis (5 banks)
 *
 * Run: npm run db:seed
 */

import 'dotenv/config';
import { PrismaClient, BankCode, TransactionStatus } from '@prisma/client';
import { setRouteHealth, setBankHealth } from '../services/redis.service';
import { connectRedis, disconnectRedis } from '../services/redis.service';
import { v4 as uuidv4 } from 'uuid';

const db = new PrismaClient();

const BANKS: BankCode[] = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'YESBANK'];

const ROUTE_HEALTH_SEED: Record<
  string,
  { health_score: number; success_rate: number; p95_ms: number; p99_ms: number }
> = {
  HDFC_ICICI: { health_score: 98.1, success_rate: 98.7, p95_ms: 310, p99_ms: 950 },
  HDFC_SBI:   { health_score: 95.4, success_rate: 96.2, p95_ms: 420, p99_ms: 1300 },
  HDFC_AXIS:  { health_score: 97.2, success_rate: 97.8, p95_ms: 355, p99_ms: 1050 },
  HDFC_YESBANK: { health_score: 91.3, success_rate: 92.1, p95_ms: 510, p99_ms: 1800 },
  ICICI_HDFC: { health_score: 97.5, success_rate: 98.1, p95_ms: 295, p99_ms: 920 },
  ICICI_SBI:  { health_score: 94.1, success_rate: 95.0, p95_ms: 435, p99_ms: 1350 },
  ICICI_AXIS: { health_score: 96.0, success_rate: 96.8, p95_ms: 380, p99_ms: 1100 },
  ICICI_YESBANK: { health_score: 90.2, success_rate: 91.3, p95_ms: 530, p99_ms: 1900 },
  SBI_HDFC:   { health_score: 93.8, success_rate: 94.5, p95_ms: 470, p99_ms: 1500 },
  SBI_ICICI:  { health_score: 93.2, success_rate: 94.0, p95_ms: 460, p99_ms: 1450 },
  SBI_AXIS:   { health_score: 92.0, success_rate: 93.1, p95_ms: 490, p99_ms: 1600 },
  SBI_YESBANK: { health_score: 88.5, success_rate: 89.7, p95_ms: 580, p99_ms: 2100 },
  AXIS_HDFC:  { health_score: 96.4, success_rate: 97.2, p95_ms: 330, p99_ms: 1010 },
  AXIS_ICICI: { health_score: 95.8, success_rate: 96.5, p95_ms: 345, p99_ms: 1060 },
  AXIS_SBI:   { health_score: 93.4, success_rate: 94.2, p95_ms: 455, p99_ms: 1420 },
  AXIS_YESBANK: { health_score: 90.8, success_rate: 91.9, p95_ms: 520, p99_ms: 1850 },
  YESBANK_HDFC: { health_score: 90.1, success_rate: 91.0, p95_ms: 545, p99_ms: 1950 },
  YESBANK_ICICI: { health_score: 89.5, success_rate: 90.5, p95_ms: 560, p99_ms: 2000 },
  YESBANK_SBI: { health_score: 87.3, success_rate: 88.5, p95_ms: 610, p99_ms: 2200 },
  YESBANK_AXIS: { health_score: 89.0, success_rate: 90.1, p95_ms: 570, p99_ms: 2050 },
};

const BANK_HEALTH_SEED = {
  HDFC:    { health_score: 97.4, sla_compliance: 99.3, avg_latency_ms: 178 },
  ICICI:   { health_score: 96.1, sla_compliance: 98.9, avg_latency_ms: 163 },
  SBI:     { health_score: 91.3, sla_compliance: 96.4, avg_latency_ms: 287 },
  AXIS:    { health_score: 95.2, sla_compliance: 98.1, avg_latency_ms: 194 },
  YESBANK: { health_score: 88.4, sla_compliance: 94.1, avg_latency_ms: 318 },
};

const MERCHANT_CODES = ['AMAZON_IN', 'SWIGGY', 'ZOMATO', 'FLIPKART', 'UBER_IN'];

const FAILURE_CODES = [
  { code: 'NPCI_ISSUER_TIMEOUT', msg: 'Issuer bank gateway timeout during execution' },
  { code: 'ACQUIRER_503_OUTAGE', msg: 'Acquirer bank 503 Service Unavailable' },
  { code: 'PSP_DECRYPTION_FAULT', msg: 'PSP decryption signature mismatch error' },
  { code: 'NET_CONGESTION_SPIKE', msg: 'Network routing handshake timeout latency' },
];

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomAmount(): number {
  // Realistic Indian payment distribution
  const r = Math.random();
  if (r < 0.3) return Math.floor(randomBetween(100, 500));
  if (r < 0.55) return Math.floor(randomBetween(500, 2000));
  if (r < 0.75) return Math.floor(randomBetween(2000, 10000));
  if (r < 0.90) return Math.floor(randomBetween(10000, 50000));
  return Math.floor(randomBetween(50000, 200000));
}

function randomPastDate(daysBack: number): Date {
  const now = Date.now();
  return new Date(now - Math.random() * daysBack * 86400 * 1000);
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function getRouteSuccessRate(sender: BankCode, receiver: BankCode): number {
  const key = `${sender}_${receiver}`;
  return (ROUTE_HEALTH_SEED[key]?.success_rate ?? 92) / 100;
}

async function seedTransactions(): Promise<void> {
  console.log('  🌱 Seeding 1000 transactions...');

  // Get merchants from DB
  const merchants = await db.merchant.findMany();
  const merchantMap = Object.fromEntries(merchants.map((m: any) => [m.code, m.id]));

  const BATCH_SIZE = 50;
  const TOTAL = 1000;
  let created = 0;

  for (let batch = 0; batch < TOTAL / BATCH_SIZE; batch++) {
    const records = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const sender = randomElement(BANKS);
      let receiver = randomElement(BANKS);
      while (receiver === sender) receiver = randomElement(BANKS);

      const amount = randomAmount();
      const createdAt = randomPastDate(30);
      const successRate = getRouteSuccessRate(sender, receiver);
      const isSuccess = Math.random() < successRate;

      const merchantCode = randomElement(MERCHANT_CODES);
      const merchantId = merchantMap[merchantCode];
      const latency = Math.floor(
        isSuccess ? randomBetween(120, 800) : randomBetween(200, 6000)
      );

      const status: TransactionStatus = isSuccess ? 'SUCCESS' : Math.random() < 0.1 ? 'TIMEOUT' : 'FAILED';
      const failure = isSuccess ? null : randomElement(FAILURE_CODES);

      records.push({
        id: uuidv4(),
        amount: amount,
        currency: 'INR',
        sender_bank: sender,
        receiver_bank: receiver,
        psp_id: 'RAZORPAY',
        merchant_id: merchantId,
        status,
        route_path: [sender, 'NPCI', receiver],
        latency_ms: latency,
        error_code: failure?.code ?? null,
        error_message: failure?.msg ?? null,
        created_at: createdAt,
        settled_at: isSuccess ? new Date(createdAt.getTime() + latency) : null,
      });
    }

    // Prisma doesn't support createMany with skipDuplicates efficiently for all cases
    // Use raw insert for speed
    await db.transaction.createMany({ data: records });
    created += records.length;
    process.stdout.write(`\r    Created ${created}/${TOTAL} transactions...`);
  }

  console.log(`\n  ✓ ${TOTAL} transactions seeded`);
}

async function seedRedisHealth(): Promise<void> {
  await connectRedis();

  console.log('  🌱 Seeding route health in Redis...');
  for (const [routeKey, health] of Object.entries(ROUTE_HEALTH_SEED)) {
    await setRouteHealth(routeKey, {
      health_score: health.health_score,
      success_rate: health.success_rate,
      failure_rate: parseFloat((100 - health.success_rate).toFixed(1)),
      p95_ms: health.p95_ms,
      p99_ms: health.p99_ms,
      timeout_rate: parseFloat((randomBetween(0.5, 3.5)).toFixed(1)),
      total_transactions: Math.floor(randomBetween(800, 3000)),
    });
  }
  console.log(`  ✓ ${Object.keys(ROUTE_HEALTH_SEED).length} route health entries seeded`);

  console.log('  🌱 Seeding bank health in Redis...');
  for (const [bankCode, health] of Object.entries(BANK_HEALTH_SEED)) {
    await setBankHealth(bankCode, {
      health_score: health.health_score,
      sla_compliance: health.sla_compliance,
      avg_latency_ms: health.avg_latency_ms,
      active_incidents_count: 0,
    });
  }
  console.log(`  ✓ ${Object.keys(BANK_HEALTH_SEED).length} bank health entries seeded`);

  await disconnectRedis();
}

async function main(): Promise<void> {
  console.log('🌱 PRISM Seed Script Starting...\n');

  try {
    // 1. Transactions
    await seedTransactions();

    // 2. Redis health data
    await seedRedisHealth();

    const stats = await db.transaction.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    console.log('\n📊 Seed Summary:');
    for (const s of stats) {
      console.log(`   ${s.status}: ${s._count._all}`);
    }

    console.log('\n✅ Seed complete.\n');
  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
