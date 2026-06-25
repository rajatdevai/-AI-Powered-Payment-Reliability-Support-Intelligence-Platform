/**
 * PRISM NPCI Switch Simulator
 *
 * Models the NPCI UPI switch — the central routing node that
 * connects all banks in the Indian payment network.
 *
 * All UPI transactions flow: Sender Bank → NPCI → Receiver Bank
 * NPCI can be placed in different conditions to simulate real incidents.
 */

export type NPCICondition = 'HEALTHY' | 'LATENCY_SPIKE' | 'TIMEOUT' | 'OUTAGE';

export type PSPId = 'RAZORPAY' | 'PAYU' | 'CASHFREE' | 'PHONEPE_PSP' | 'DIRECT';

export interface NPCIRoutingResult {
  status: 'ROUTED' | 'TIMEOUT' | 'REJECTED';
  latency_ms: number;
  route_path: string[];
  error_code: string | null;
  npci_reference: string;
}

interface PSPConfig {
  name: string;
  sponsor_bank: string;
  success_rate: number;
  avg_latency_ms: number;
}

const PSP_CONFIGS: Record<PSPId, PSPConfig> = {
  RAZORPAY: {
    name: 'Razorpay',
    sponsor_bank: 'ICICI',
    success_rate: 0.984,
    avg_latency_ms: 85,
  },
  PAYU: {
    name: 'PayU India',
    sponsor_bank: 'HDFC',
    success_rate: 0.978,
    avg_latency_ms: 95,
  },
  CASHFREE: {
    name: 'Cashfree Payments',
    sponsor_bank: 'AXIS',
    success_rate: 0.971,
    avg_latency_ms: 90,
  },
  PHONEPE_PSP: {
    name: 'PhonePe PSP',
    sponsor_bank: 'YESBANK',
    success_rate: 0.961,
    avg_latency_ms: 105,
  },
  DIRECT: {
    name: 'Direct UPI',
    sponsor_bank: 'SBI',
    success_rate: 0.955,
    avg_latency_ms: 120,
  },
};

class NPCISimulator {
  private condition: NPCICondition = 'HEALTHY';

  setCondition(condition: NPCICondition): void {
    this.condition = condition;
  }

  getCondition(): NPCICondition {
    return this.condition;
  }

  async route(
    senderBank: string,
    receiverBank: string,
    pspId: PSPId = 'DIRECT'
  ): Promise<NPCIRoutingResult> {
    const routePath = [senderBank, 'NPCI', receiverBank];
    const reference = `NPCI${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    let latencyMin = 40;
    let latencyMax = 120;
    let successRate = 0.998; // NPCI itself is extremely reliable

    switch (this.condition) {
      case 'LATENCY_SPIKE':
        latencyMin = 800;
        latencyMax = 2500;
        successRate = 0.92;
        break;
      case 'TIMEOUT':
        latencyMin = 4800;
        latencyMax = 6200;
        successRate = 0.15;
        break;
      case 'OUTAGE':
        latencyMin = 50;
        latencyMax = 200;
        successRate = 0.01;
        break;
    }

    const latency = Math.floor(Math.random() * (latencyMax - latencyMin) + latencyMin);
    await sleep(Math.min(latency, 150)); // cap simulation wait

    if (Math.random() < successRate) {
      return {
        status: 'ROUTED',
        latency_ms: latency,
        route_path: routePath,
        error_code: null,
        npci_reference: reference,
      };
    }

    if (this.condition === 'TIMEOUT' || latency > 5000) {
      return {
        status: 'TIMEOUT',
        latency_ms: latency,
        route_path: routePath,
        error_code: 'NPCI_SWITCH_TIMEOUT',
        npci_reference: reference,
      };
    }

    return {
      status: 'REJECTED',
      latency_ms: latency,
      route_path: routePath,
      error_code: 'NPCI_SWITCH_OUTAGE',
      npci_reference: reference,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const npciSimulator = new NPCISimulator();
export { PSP_CONFIGS };
