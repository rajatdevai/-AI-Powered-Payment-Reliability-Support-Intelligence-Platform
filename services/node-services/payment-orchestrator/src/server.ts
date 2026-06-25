import Fastify from 'fastify';
import cors from '@fastify/cors';
import { paymentsRoutes } from './routes/payments';
import { env } from './env';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss.l' },
            },
          }
        : {}),
    },
  });

  // CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    service: 'payment-orchestrator',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }));

  // Routes
  await app.register(paymentsRoutes);

  return app;
}
