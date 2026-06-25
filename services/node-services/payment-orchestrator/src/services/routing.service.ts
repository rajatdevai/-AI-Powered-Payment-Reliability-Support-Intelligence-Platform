import { getRouteHealthFromRedis, getBankHealthFromRedis } from './redis.service';
import type { BankCode } from '../simulators/bank.simulator';

export interface RouteSelection {
  sender_bank: BankCode;
  receiver_bank: BankCode;
  route_path: string[];
  route_key: string;
  health_score: number;
  selected_psp: string;
}

/**
 * Routing Service
 *
 * Selects the healthiest available route for a payment.
 * In the PRISM model, all UPI payments route through NPCI.
 * Route selection primarily considers Redis health scores.
 *
 * Future: multi-hop routing, PSP selection based on merchant config.
 */
export class RoutingService {
  async selectBestRoute(
    senderBank: BankCode,
    receiverBank: BankCode
  ): Promise<RouteSelection> {
    const routeKey = `${senderBank}_${receiverBank}`;

    // Fetch health data from Redis (may be null if Redis is down)
    const [routeHealth, senderHealth, receiverHealth] = await Promise.all([
      getRouteHealthFromRedis(routeKey),
      getBankHealthFromRedis(senderBank),
      getBankHealthFromRedis(receiverBank),
    ]);

    const routeScore = routeHealth?.health_score ?? this.getDefaultRouteScore(routeKey);
    const senderScore = senderHealth?.health_score ?? this.getDefaultBankScore(senderBank);
    const receiverScore = receiverHealth?.health_score ?? this.getDefaultBankScore(receiverBank);

    // Composite score: route health weighted higher
    const compositeScore = routeScore * 0.6 + senderScore * 0.2 + receiverScore * 0.2;

    // PSP is determined by sender bank configuration
    const selectedPsp = this.selectPSP(senderBank);

    return {
      sender_bank: senderBank,
      receiver_bank: receiverBank,
      route_path: [senderBank, 'NPCI', receiverBank],
      route_key: routeKey,
      health_score: parseFloat(compositeScore.toFixed(1)),
      selected_psp: selectedPsp,
    };
  }

  private selectPSP(senderBank: BankCode): string {
    const pspMap: Record<BankCode, string> = {
      HDFC: 'PAYU',
      ICICI: 'RAZORPAY',
      SBI: 'DIRECT',
      AXIS: 'CASHFREE',
      YESBANK: 'PHONEPE_PSP',
    };
    return pspMap[senderBank] ?? 'DIRECT';
  }

  private getDefaultRouteScore(routeKey: string): number {
    const defaults: Record<string, number> = {
      HDFC_ICICI: 98, HDFC_SBI: 95, HDFC_AXIS: 97, HDFC_YESBANK: 91,
      ICICI_HDFC: 97, ICICI_SBI: 94, ICICI_AXIS: 96, ICICI_YESBANK: 90,
      SBI_HDFC: 93, SBI_ICICI: 93, SBI_AXIS: 92, SBI_YESBANK: 88,
      AXIS_HDFC: 96, AXIS_ICICI: 95, AXIS_SBI: 93, AXIS_YESBANK: 90,
      YESBANK_HDFC: 90, YESBANK_ICICI: 89, YESBANK_SBI: 87, YESBANK_AXIS: 89,
    };
    return defaults[routeKey] ?? 90;
  }

  private getDefaultBankScore(bankCode: BankCode): number {
    const defaults: Record<BankCode, number> = {
      HDFC: 97, ICICI: 96, SBI: 91, AXIS: 95, YESBANK: 88,
    };
    return defaults[bankCode] ?? 90;
  }
}

export const routingService = new RoutingService();
