/**
 * PRISM Kafka Event Contracts
 *
 * Single source of truth for all Kafka topic schemas.
 * Consumed by: Node.js services (KafkaJS) and Python services (confluent-kafka).
 *
 * Topic ownership is enforced by AI_ENGINEERING_OPERATING_SYSTEM.md § 4.4.
 * One publisher per topic. Multiple consumers allowed.
 */

// ============================================================
// BASE
// ============================================================

/** Every Kafka event must include these fields */
export interface BaseEvent {
  event_id: string;          // UUID — unique per event, used for deduplication
  event_type: KafkaTopics;   // Discriminator
  correlation_id: string;    // Traces a payment across all downstream events
  timestamp: string;         // ISO 8601
  version: '1.0';            // Schema version — bump on breaking changes
}

/** All PRISM Kafka topic names */
export type KafkaTopics =
  | 'payment.initiated'
  | 'payment.processing'
  | 'payment.success'
  | 'payment.failed'
  | 'payment.timeout'
  | 'payment.refund'
  | 'route.metrics'
  | 'incident.created'
  | 'incident.resolved'
  | 'rca.generated'
  | 'reversal.predicted'
  | 'blast_radius.calculated'
  | 'support.case.created'
  | 'support.case.closed'
  | 'fraud.detected';

export type BankCode = 'HDFC' | 'ICICI' | 'SBI' | 'AXIS' | 'YESBANK';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentSeverity = 'LOW' | 'HIGH' | 'CRITICAL';

// ============================================================
// PAYMENT EVENTS
// Publisher: payment-orchestrator
// ============================================================

export interface PaymentInitiatedEvent extends BaseEvent {
  event_type: 'payment.initiated';
  transaction_id: string;
  amount: number;
  currency: string;
  sender_bank: BankCode;
  receiver_bank: BankCode;
  route_path: string[];
  psp_id?: string;
  merchant_id?: string;
  user_id?: string;
}

export interface PaymentProcessingEvent extends BaseEvent {
  event_type: 'payment.processing';
  transaction_id: string;
  route_step: string;        // Current hop e.g. "NPCI"
  elapsed_ms: number;
}

export interface PaymentSuccessEvent extends BaseEvent {
  event_type: 'payment.success';
  transaction_id: string;
  amount: number;
  currency: string;
  sender_bank: BankCode;
  receiver_bank: BankCode;
  route_path: string[];
  latency_ms: number;
}

export interface PaymentFailedEvent extends BaseEvent {
  event_type: 'payment.failed';
  transaction_id: string;
  amount: number;
  currency: string;
  sender_bank: BankCode;
  receiver_bank: BankCode;
  route_path: string[];
  error_code: string;
  error_message: string;
  latency_ms: number;
}

export interface PaymentTimeoutEvent extends BaseEvent {
  event_type: 'payment.timeout';
  transaction_id: string;
  amount: number;
  sender_bank: BankCode;
  receiver_bank: BankCode;
  route_path: string[];
  timeout_at_step: string;   // Which hop timed out
  elapsed_ms: number;
}

export interface PaymentRefundEvent extends BaseEvent {
  event_type: 'payment.refund';
  transaction_id: string;
  refund_id: string;
  amount: number;
  currency: string;
  refund_initiated_by: 'SYSTEM' | 'AGENT' | 'USER';
  estimated_completion: string;
}

// ============================================================
// ROUTE METRICS EVENT
// Publisher: route-health-engine (Node)
// ============================================================

export interface RouteMetricsEvent extends BaseEvent {
  event_type: 'route.metrics';
  route_key: string;             // e.g. "HDFC_SBI"
  sender_bank: BankCode;
  receiver_bank: BankCode;
  window_seconds: number;        // Measurement window (e.g. 10)
  success_rate: number;
  failure_rate: number;
  timeout_rate: number;
  p95_ms: number;
  p99_ms: number;
  health_score: number;
  total_transactions: number;
}

// ============================================================
// INCIDENT EVENTS
// Publisher: incident-engine (Python)
// ============================================================

export interface IncidentCreatedEvent extends BaseEvent {
  event_type: 'incident.created';
  incident_id: string;
  route: string;
  severity: IncidentSeverity;
  description: string;
  trigger_metric: string;         // e.g. "failure_rate > 30%"
  trigger_value: number;
}

export interface IncidentResolvedEvent extends BaseEvent {
  event_type: 'incident.resolved';
  incident_id: string;
  route: string;
  resolved_reason: string;
  duration_minutes: number;
}

// ============================================================
// RCA EVENT
// Publisher: rca-engine (Python)
// ============================================================

export interface RcaGeneratedEvent extends BaseEvent {
  event_type: 'rca.generated';
  transaction_id: string;
  rca_report_id: string;
  root_cause: string;
  affected_component: string;
  confidence: number;            // 0.0 – 1.0
  llm_summary: string;
}

// ============================================================
// REVERSAL EVENT
// Publisher: reversal-engine (Python)
// ============================================================

export interface ReversalPredictedEvent extends BaseEvent {
  event_type: 'reversal.predicted';
  transaction_id: string;
  reversal_prediction_id: string;
  refund_eta: string;
  refund_eta_minutes: number;
  reversal_confidence: number;   // 0 – 100
}

// ============================================================
// BLAST RADIUS EVENT
// Publisher: blast-radius-engine (Python)
// ============================================================

export interface BlastRadiusCalculatedEvent extends BaseEvent {
  event_type: 'blast_radius.calculated';
  incident_id: string;
  affected_routes: string[];
  affected_banks: BankCode[];
  affected_psps: string[];
  affected_merchants: string[];
  affected_users_count: number;
  estimated_txn_impact: number;
}

// ============================================================
// SUPPORT CASE EVENTS
// Publisher: api-gateway (Node)
// ============================================================

export interface SupportCaseCreatedEvent extends BaseEvent {
  event_type: 'support.case.created';
  case_id: string;
  transaction_id: string;
  customer_id?: string;
  channel: 'PHONE' | 'CHAT' | 'EMAIL' | 'PORTAL';
}

export interface SupportCaseClosedEvent extends BaseEvent {
  event_type: 'support.case.closed';
  case_id: string;
  transaction_id: string;
  resolution: string;
  was_escalated: boolean;
  duration_minutes: number;
}

// ============================================================
// FRAUD EVENT
// Publisher: fraud-engine (Python)
// ============================================================

export interface FraudDetectedEvent extends BaseEvent {
  event_type: 'fraud.detected';
  transaction_id: string;
  fraud_type: string;           // e.g. "VELOCITY_BREACH", "PATTERN_ANOMALY"
  risk_score: number;           // 0 – 100
  blocked: boolean;
  evidence: Record<string, unknown>;
}

// ============================================================
// UNION TYPE — Discriminated union across all events
// ============================================================

export type PrismEvent =
  | PaymentInitiatedEvent
  | PaymentProcessingEvent
  | PaymentSuccessEvent
  | PaymentFailedEvent
  | PaymentTimeoutEvent
  | PaymentRefundEvent
  | RouteMetricsEvent
  | IncidentCreatedEvent
  | IncidentResolvedEvent
  | RcaGeneratedEvent
  | ReversalPredictedEvent
  | BlastRadiusCalculatedEvent
  | SupportCaseCreatedEvent
  | SupportCaseClosedEvent
  | FraudDetectedEvent;

// ============================================================
// CONSUMER REGISTRY
// Maps each topic to its expected event type.
// Use this to type Kafka consumers correctly.
// ============================================================

export type TopicEventMap = {
  'payment.initiated': PaymentInitiatedEvent;
  'payment.processing': PaymentProcessingEvent;
  'payment.success': PaymentSuccessEvent;
  'payment.failed': PaymentFailedEvent;
  'payment.timeout': PaymentTimeoutEvent;
  'payment.refund': PaymentRefundEvent;
  'route.metrics': RouteMetricsEvent;
  'incident.created': IncidentCreatedEvent;
  'incident.resolved': IncidentResolvedEvent;
  'rca.generated': RcaGeneratedEvent;
  'reversal.predicted': ReversalPredictedEvent;
  'blast_radius.calculated': BlastRadiusCalculatedEvent;
  'support.case.created': SupportCaseCreatedEvent;
  'support.case.closed': SupportCaseClosedEvent;
  'fraud.detected': FraudDetectedEvent;
};

export type KafkaConsumerType<T extends KafkaTopics> = TopicEventMap[T];
