import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  ENABLE_KAFKA: z.string().transform((v) => v === 'true').default('false'),
  PREDICTION_ENGINE_GRPC_ADDR: z.string().default('localhost:50051'),
  ENABLE_GRPC: z.string().transform((v) => v === 'true').default('false'),
  PORT: z.string().transform(Number).default('3010'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
});

function loadEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
