import { buildServer } from './server';
import { env } from './env';
import { connectDb, disconnectDb } from './services/db';
import { connectRedis, disconnectRedis } from './services/redis.service';
import { kafkaService } from './services/kafka.service';
import { predictionClient } from './services/prediction.client';

async function main() {
  console.log('🚀 Starting PRISM Payment Orchestrator...\n');

  // Connect to dependencies (with graceful degradation)
  await connectDb();
  console.log('  ✓ PostgreSQL connected');

  await connectRedis();
  console.log('  ✓ Redis initialised');

  await kafkaService.connect();
  console.log('  ✓ Kafka initialised');

  await predictionClient.connect();
  console.log('  ✓ Prediction client initialised');

  // Build and start Fastify
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n⚡ Payment Orchestrator running on http://localhost:${env.PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST http://localhost:${env.PORT}/payments/initiate`);
    console.log(`  POST http://localhost:${env.PORT}/payments/confirm`);
    console.log(`  GET  http://localhost:${env.PORT}/payments/:id`);
    console.log(`  GET  http://localhost:${env.PORT}/payments/stats`);
    console.log(`  GET  http://localhost:${env.PORT}/health`);
    console.log(`\nDebug:`);
    console.log(`  POST http://localhost:${env.PORT}/debug/bank-condition`);
    console.log(`  POST http://localhost:${env.PORT}/debug/npci-condition`);
    console.log(`  GET  http://localhost:${env.PORT}/debug/simulator-status\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    await app.close();
    await kafkaService.disconnect();
    await disconnectRedis();
    await disconnectDb();
    console.log('✓ Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
