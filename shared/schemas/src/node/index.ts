import { z } from 'zod';

// ============================================================
// ENUMS
// ============================================================

export const BankCodeSchema = z.enum(['HDFC', 'ICICI', 'SBI', 'AXIS', 'YESBANK']);
export type BankCode = z.infer<typeof BankCodeSchema>;

export const TransactionStatusSchema = z.enum([
  'PENDING',
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'REVERSED',
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const IncidentSeveritySchema = z.enum(['LOW', 'HIGH', 'CRITICAL']);
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;

export const IncidentStatusSchema = z.enum(['ACTIVE', 'RESOLVED']);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const CaseStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'ESCALATED',
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

// ============================================================
// TRANSACTION
// ============================================================

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('INR'),
  sender_bank: BankCodeSchema,
  receiver_bank: BankCodeSchema,
  psp_id: z.string().optional(),
  merchant_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  status: TransactionStatusSchema,
  route_path: z.array(z.string()).min(1),
  latency_ms: z.number().int().nonnegative().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  root_cause: z.string().nullable().optional(),
  affected_component: z.string().nullable().optional(),
  rca_confidence: z.number().min(0).max(1).nullable().optional(),
  expected_reversal: z.string().nullable().optional(),
  reversal_confidence: z.number().min(0).max(100).nullable().optional(),
  created_at: z.string().datetime(),
  settled_at: z.string().datetime().nullable().optional(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransactionSchema = TransactionSchema.pick({
  amount: true,
  currency: true,
  sender_bank: true,
  receiver_bank: true,
  psp_id: true,
  merchant_id: true,
  user_id: true,
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;

// ============================================================
// INCIDENT
// ============================================================

export const BlastRadiusSchema = z.object({
  affected_routes: z.array(z.string()),
  affected_banks: z.array(BankCodeSchema),
  affected_psps: z.array(z.string()),
  affected_merchants: z.array(z.string()),
  affected_users_count: z.number().int().nonnegative(),
  estimated_txn_impact: z.number().int().nonnegative(),
});

export type BlastRadius = z.infer<typeof BlastRadiusSchema>;

export const IncidentSchema = z.object({
  id: z.string().uuid(),
  route: z.string(),
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema,
  affected_users_count: z.number().int().nonnegative().default(0),
  affected_merchants_count: z.number().int().nonnegative().default(0),
  blast_radius: BlastRadiusSchema.nullable().optional(),
  description: z.string(),
  root_cause: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable().optional(),
});

export type Incident = z.infer<typeof IncidentSchema>;

// ============================================================
// SUPPORT CASE
// ============================================================

export const SupportCaseSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().nullable().optional(),
  status: CaseStatusSchema,
  ai_rca_summary: z.string().nullable().optional(),
  ai_suggested_response: z.string().nullable().optional(),
  ai_escalation_recommendation: z.string().nullable().optional(),
  refund_eta: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  closed_at: z.string().datetime().nullable().optional(),
});

export type SupportCase = z.infer<typeof SupportCaseSchema>;

// ============================================================
// ROUTE HEALTH  (Redis hot cache)
// ============================================================

export const RouteHealthSchema = z.object({
  route_key: z.string(),             // e.g. "HDFC_SBI"
  health_score: z.number().min(0).max(100),
  success_rate: z.number().min(0).max(100),
  failure_rate: z.number().min(0).max(100),
  p95_ms: z.number().nonnegative(),
  p99_ms: z.number().nonnegative(),
  timeout_rate: z.number().min(0).max(100),
  total_transactions: z.number().int().nonnegative(),
  last_updated: z.string().datetime(),
});

export type RouteHealth = z.infer<typeof RouteHealthSchema>;

// ============================================================
// BANK HEALTH  (Redis hot cache)
// ============================================================

export const BankHealthSchema = z.object({
  bank_id: BankCodeSchema,
  health_score: z.number().min(0).max(100),
  sla_compliance: z.number().min(0).max(100),
  avg_latency_ms: z.number().nonnegative(),
  active_incidents_count: z.number().int().nonnegative(),
  last_updated: z.string().datetime(),
});

export type BankHealth = z.infer<typeof BankHealthSchema>;

// ============================================================
// PREDICTION RESPONSE
// ============================================================

export const PredictionResponseSchema = z.object({
  route_key: z.string(),
  sender_bank: BankCodeSchema,
  receiver_bank: BankCodeSchema,
  amount: z.number().positive(),
  success_probability: z.number().min(0).max(100),
  risk_level: RiskLevelSchema,
  recommendation: z.string(),
  route_health_score: z.number().min(0).max(100),
  active_incidents: z.array(z.string()),
  cached: z.boolean().default(false),
  generated_at: z.string().datetime(),
});

export type PredictionResponse = z.infer<typeof PredictionResponseSchema>;

// ============================================================
// RCA REPORT
// ============================================================

export const RcaEvidenceSchema = z.object({
  neo4j_path: z.array(z.string()).optional(),       // Graph traversal path
  qdrant_matches: z.array(
    z.object({
      document_id: z.string(),
      score: z.number(),
      summary: z.string(),
    })
  ).optional(),
  error_pattern: z.string().optional(),
  frequency: z.number().int().optional(),
});

export const RcaReportSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  root_cause: z.string(),
  affected_component: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: RcaEvidenceSchema,
  llm_summary: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export type RcaReport = z.infer<typeof RcaReportSchema>;

// ============================================================
// REVERSAL PREDICTION
// ============================================================

export const ReversalPredictionSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  refund_eta: z.string(),                // e.g. "14 minutes", "3 hours"
  refund_eta_minutes: z.number().int(),  // numeric for sorting/filtering
  reversal_confidence: z.number().min(0).max(100),
  similar_cases_count: z.number().int().nonnegative(),
  bank_behavior_note: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export type ReversalPrediction = z.infer<typeof ReversalPredictionSchema>;
