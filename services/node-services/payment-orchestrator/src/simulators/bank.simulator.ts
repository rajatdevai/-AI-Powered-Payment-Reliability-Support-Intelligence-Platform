/**
 * PRISM Bank Simulator
 *
 * Simulates the behavior of Indian bank gateways:
 * HDFC, ICICI, SBI, AXIS, YESBANK
 *
 * Each bank has realistic success rates, latency profiles,
 * and can be placed in different network conditions for demo/testing.
 *
 * Route-level forced failures let you lock specific sender→receiver pairs
 * to always fail — useful for interview/demo walkthroughs.
 */

export type BankCode = 'HDFC' | 'ICICI' | 'SBI' | 'AXIS' | 'YESBANK';
export type NetworkCondition = 'HEALTHY' | 'LATENCY_SPIKE' | 'TIMEOUT_FLURRY' | 'OUTAGE';

export interface BankResult {
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  latency_ms: number;
  error_code: string | null;
  error_message: string | null;
  bank_code: BankCode;
  role: 'SENDER' | 'RECEIVER';
}

interface BankConfig {
  name: string;
  baseSuccessRate: number;
  baseLatencyMs: number;
  latencyJitter: number;
}

const BANK_CONFIGS: Record<BankCode, BankConfig> = {
  HDFC: { name: 'HDFC Bank', baseSuccessRate: 0.987, baseLatencyMs: 175, latencyJitter: 60 },
  ICICI: { name: 'ICICI Bank', baseSuccessRate: 0.979, baseLatencyMs: 165, latencyJitter: 55 },
  SBI: { name: 'State Bank of India', baseSuccessRate: 0.944, baseLatencyMs: 285, latencyJitter: 110 },
  AXIS: { name: 'Axis Bank', baseSuccessRate: 0.968, baseLatencyMs: 192, latencyJitter: 70 },
  YESBANK: { name: 'Yes Bank', baseSuccessRate: 0.912, baseLatencyMs: 315, latencyJitter: 140 },
};

const FAILURE_CODES = [
  { code: 'NPCI_ISSUER_TIMEOUT', message: 'Issuer bank gateway timeout during execution' },
  { code: 'ACQUIRER_503_OUTAGE', message: 'Acquirer bank 503 Service Unavailable' },
  { code: 'PSP_DECRYPTION_FAULT', message: 'PSP decryption signature mismatch error' },
  { code: 'NET_CONGESTION_SPIKE', message: 'Network routing handshake timeout latency' },
];

interface ForcedFailConfig {
  error_code: string;
  error_message: string;
  latency_ms: number;
}

class BankSimulator {
  /** Per-bank network condition overrides */
  private conditions = new Map<BankCode, NetworkCondition>();

  /**
   * Route-level forced failures: "SenderBank→ReceiverBank"
   * When a payment route matches, the receiver step is ALWAYS failed
   * regardless of bank health or NPCI status.
   * Stored in-memory so it resets on restart (intentional — demo only).
   */
  private forceFailRoutes = new Map<string, ForcedFailConfig>();

  // ── Per-bank condition API ────────────────────────────────────────────────

  setCondition(bankCode: BankCode, condition: NetworkCondition): void {
    this.conditions.set(bankCode, condition);
  }

  getCondition(bankCode: BankCode): NetworkCondition {
    return this.conditions.get(bankCode) ?? 'HEALTHY';
  }

  getAllConditions(): Record<string, NetworkCondition> {
    const result: Record<string, NetworkCondition> = {};
    for (const bank of Object.keys(BANK_CONFIGS) as BankCode[]) {
      result[bank] = this.getCondition(bank);
    }
    return result;
  }

  // ── Route-level forced failure API ────────────────────────────────────────

  private routeKey(sender: BankCode, receiver: BankCode): string {
    return `${sender}→${receiver}`;
  }

  setForceFailRoute(
    sender: BankCode,
    receiver: BankCode,
    error_code = 'ISSUER_SWITCH_REJECTED',
    error_message = 'Transaction rejected by issuer switch — route is blocked for maintenance',
    latency_ms = 320,
  ): void {
    this.forceFailRoutes.set(this.routeKey(sender, receiver), { error_code, error_message, latency_ms });
  }

  clearForceFailRoute(sender: BankCode, receiver: BankCode): void {
    this.forceFailRoutes.delete(this.routeKey(sender, receiver));
  }

  clearAllForceFailRoutes(): void {
    this.forceFailRoutes.clear();
  }

  getForceFailRoutes(): Record<string, ForcedFailConfig> {
    const result: Record<string, ForcedFailConfig> = {};
    for (const [key, val] of this.forceFailRoutes.entries()) {
      result[key] = val;
    }
    return result;
  }

  /**
   * Returns forced-fail config if this sender→receiver route is locked.
   * Called in payments.ts BEFORE running the simulation steps.
   */
  checkForceFailRoute(sender: BankCode, receiver: BankCode): ForcedFailConfig | null {
    return this.forceFailRoutes.get(this.routeKey(sender, receiver)) ?? null;
  }

  // ── Main simulation ───────────────────────────────────────────────────────

  async processTransaction(
    bankCode: BankCode,
    role: 'SENDER' | 'RECEIVER',
    amount: number
  ): Promise<BankResult> {
    const config = BANK_CONFIGS[bankCode];
    const condition = this.getCondition(bankCode);

    let successRate = config.baseSuccessRate;
    let latencyMin = config.baseLatencyMs - config.latencyJitter;
    let latencyMax = config.baseLatencyMs + config.latencyJitter;

    switch (condition) {
      case 'LATENCY_SPIKE':
        successRate *= 0.82;
        latencyMin = 1500;
        latencyMax = 4000;
        break;
      case 'TIMEOUT_FLURRY':
        successRate *= 0.28;
        latencyMin = 5000;
        latencyMax = 8000;
        break;
      case 'OUTAGE':
        successRate = 0.02;
        latencyMin = 80;
        latencyMax = 350;
        break;
    }

    if (amount >= 50000) successRate *= 0.96;

    const latency = Math.floor(Math.random() * (latencyMax - latencyMin) + latencyMin);
    await sleep(Math.min(latency, 250));

    if (Math.random() < successRate) {
      return { status: 'SUCCESS', latency_ms: latency, error_code: null, error_message: null, bank_code: bankCode, role };
    }

    if (condition === 'TIMEOUT_FLURRY' || latency > 5000) {
      return { status: 'TIMEOUT', latency_ms: latency, error_code: 'NPCI_ISSUER_TIMEOUT', error_message: 'Issuer bank gateway timeout during execution', bank_code: bankCode, role };
    }

    if (condition === 'OUTAGE') {
      return { status: 'FAILED', latency_ms: latency, error_code: 'ACQUIRER_503_OUTAGE', error_message: 'Acquirer bank 503 Service Unavailable', bank_code: bankCode, role };
    }

    const failCode = FAILURE_CODES[Math.floor(Math.random() * FAILURE_CODES.length)]!;
    return { status: 'FAILED', latency_ms: latency, error_code: failCode.code, error_message: failCode.message, bank_code: bankCode, role };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const bankSimulator = new BankSimulator();
export { BANK_CONFIGS };
