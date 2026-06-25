import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import pino from 'pino';
import { env } from '../env';
import { getRouteHealthFromRedis } from './redis.service';

const logger = pino({ name: 'prediction-client', level: env.LOG_LEVEL });

// Path to the shared proto file (relative to repo root)
const PROTO_PATH = path.resolve(
  __dirname,
  '../../../../../shared/protobuf/prediction.proto'
);

export interface PredictRequest {
  sender_bank: string;
  receiver_bank: string;
  amount: number;
  currency?: string;
}

export interface PredictResponse {
  route_key: string;
  success_probability: number;
  risk_level: string;
  recommendation: string;
  route_health_score: number;
  active_incidents: string[];
  cached: boolean;
  generated_at: string;
}

class PredictionClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  async connect(): Promise<void> {
    if (!env.ENABLE_GRPC) {
      logger.info('gRPC disabled (ENABLE_GRPC=false). Using local rule-based fallback.');
      return;
    }

    try {
      const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proto = grpc.loadPackageDefinition(packageDef) as any;
      this.client = new proto.prism.prediction.PredictionService(
        env.PREDICTION_ENGINE_GRPC_ADDR,
        grpc.credentials.createInsecure(),
        { 'grpc.max_receive_message_length': 4 * 1024 * 1024 }
      );

      logger.info({ addr: env.PREDICTION_ENGINE_GRPC_ADDR }, 'gRPC prediction client ready');
    } catch (err) {
      logger.warn({ err }, 'gRPC unavailable — using local fallback prediction');
      this.client = null;
    }
  }

  async predict(request: PredictRequest): Promise<PredictResponse> {
    if (this.client && env.ENABLE_GRPC) {
      return new Promise((resolve, reject) => {
        const deadline = new Date(Date.now() + 3000); // 3s timeout
        this.client.PredictPaymentSuccess(
          { ...request, currency: request.currency ?? 'INR', route_history: [] },
          { deadline },
          (err: Error | null, response: PredictResponse) => {
            if (err) {
              logger.warn({ err }, 'gRPC predict failed — falling back to local');
              resolve(this.localPredict(request));
            } else {
              resolve(response);
            }
          }
        );
      });
    }

    return this.localPredict(request);
  }

  /**
   * Rule-based fallback prediction (mirrors prediction-engine logic).
   * Used when gRPC is disabled or unavailable.
   */
  private async localPredict(request: PredictRequest): Promise<PredictResponse> {
    const routeKey = `${request.sender_bank}_${request.receiver_bank}`;
    const routeHealth = await getRouteHealthFromRedis(routeKey);

    let baseScore = routeHealth?.health_score ?? this.getDefaultScore(routeKey);

    // High-value transaction penalty
    if (request.amount >= 50000) baseScore *= 0.96;
    else if (request.amount >= 10000 && baseScore < 90) baseScore *= 0.97;

    // Clamp
    const successProbability = Math.max(5, Math.min(99, baseScore));

    let riskLevel: string;
    let recommendation: string;

    if (successProbability > 85) {
      riskLevel = 'LOW';
      recommendation = 'Safe to proceed.';
    } else if (successProbability > 65) {
      riskLevel = 'MEDIUM';
      recommendation = 'Moderate risk. Consider retrying if this fails.';
    } else if (successProbability > 35) {
      riskLevel = 'HIGH';
      recommendation = 'Elevated failure risk. Consider switching sender account.';
    } else {
      riskLevel = 'CRITICAL';
      recommendation = 'Route critically degraded. Do not proceed. Use alternate method.';
    }

    return {
      route_key: routeKey,
      success_probability: parseFloat(successProbability.toFixed(1)),
      risk_level: riskLevel,
      recommendation,
      route_health_score: baseScore,
      active_incidents: [],
      cached: false,
      generated_at: new Date().toISOString(),
    };
  }

  /** Realistic default health scores by route */
  private getDefaultScore(routeKey: string): number {
    const defaults: Record<string, number> = {
      HDFC_ICICI: 98, HDFC_SBI: 95, HDFC_AXIS: 97, HDFC_YESBANK: 91,
      ICICI_HDFC: 97, ICICI_SBI: 94, ICICI_AXIS: 96, ICICI_YESBANK: 90,
      SBI_HDFC: 93, SBI_ICICI: 93, SBI_AXIS: 92, SBI_YESBANK: 88,
      AXIS_HDFC: 96, AXIS_ICICI: 95, AXIS_SBI: 93, AXIS_YESBANK: 90,
      YESBANK_HDFC: 90, YESBANK_ICICI: 89, YESBANK_SBI: 87, YESBANK_AXIS: 89,
    };
    return defaults[routeKey] ?? 90;
  }
}

export const predictionClient = new PredictionClient();
