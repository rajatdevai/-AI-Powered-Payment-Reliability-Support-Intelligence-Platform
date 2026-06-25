import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// ── PostgreSQL pool (lazy singleton, same Neon DB as payment-orchestrator) ──
let pgPool: Pool | null = null;

function getPgPool(): Pool | null {
  if (pgPool) return pgPool;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('[cases/route] DATABASE_URL not set — will use mock data.');
    return null;
  }
  pgPool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  return pgPool;
}

const MOCK_CASES = [
  {
    id: 'case-1001',
    transaction_id: 'tx-2001',
    customer_id: 'cust-501',
    agent_id: null,
    status: 'ESCALATED',
    ai_rca_summary: 'NPCI switch failed to route to HDFC bank due to a sudden network latency spike of 4500ms.',
    ai_suggested_response: 'Dear Customer, we detected a gateway timeout with HDFC bank. Reversal SLA has been triggered, and your funds will be credited back within 15 minutes.',
    ai_escalation_recommendation: 'Escalated to Tier 2 Support. Requires YESBANK liquidity pool check.',
    refund_eta: '12 minutes',
    notes: 'Customer contacted twice. Highly annoyed.',
    created_at: new Date(Date.now() - 600000).toISOString(),
    updated_at: new Date(Date.now() - 600000).toISOString(),
    closed_at: null,
    transaction: {
      id: 'tx-2001',
      amount: 45000,
      currency: 'INR',
      sender_bank: 'YESBANK',
      receiver_bank: 'HDFC',
      status: 'TIMEOUT',
      route_path: ['YESBANK', 'NPCI', 'HDFC'],
      latency_ms: 4500,
      error_code: 'NPCI_ISSUER_TIMEOUT',
      error_message: 'Gateway timeout from HDFC issuer switch',
      root_cause: 'HDFC core banking system overloaded',
      affected_component: 'ISSUER_SWITCH',
      rca_confidence: 0.92,
      expected_reversal: '15 minutes',
      reversal_confidence: 95.0,
      created_at: new Date(Date.now() - 600000).toISOString(),
    },
    customer: { id: 'cust-501', name: 'Rohan Sharma', phone: '+91 98765 43210', email: 'rohan.sharma@example.com' }
  },
  {
    id: 'case-1002',
    transaction_id: 'tx-2002',
    customer_id: 'cust-502',
    agent_id: 'agent-101',
    status: 'IN_PROGRESS',
    ai_rca_summary: 'Handshake signature validation failed during decryption with ICICI bank.',
    ai_suggested_response: 'Dear Customer, your payment failed due to a cryptographic validation error. No funds were debited.',
    ai_escalation_recommendation: 'No escalation needed. Auto-reversal successfully confirmed by ICICI gateway.',
    refund_eta: '0 minutes',
    notes: 'Verified transaction status with ICICI router.',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
    closed_at: null,
    transaction: {
      id: 'tx-2002',
      amount: 1200,
      currency: 'INR',
      sender_bank: 'ICICI',
      receiver_bank: 'SBI',
      status: 'FAILED',
      route_path: ['ICICI', 'NPCI', 'SBI'],
      latency_ms: 180,
      error_code: 'DECRYPTION_FAILED',
      error_message: 'Decryption failed: signature mismatch',
      root_cause: 'Cryptographic handshake failure',
      affected_component: 'ACQUIRER_GATEWAY',
      rca_confidence: 0.88,
      expected_reversal: 'Immediate',
      reversal_confidence: 100.0,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    customer: { id: 'cust-502', name: 'Priya Patel', phone: '+91 99999 88888', email: 'priya.patel@example.com' }
  },
  {
    id: 'case-1003',
    transaction_id: 'tx-2003',
    customer_id: 'cust-503',
    agent_id: null,
    status: 'OPEN',
    ai_rca_summary: 'AXIS bank settlement server reported 503 Service Unavailable.',
    ai_suggested_response: 'Dear Customer, the recipient bank (AXIS) is experiencing temporary downtime. Your reversal will be resolved within 2 hours.',
    ai_escalation_recommendation: 'Recommend automatic reconciliation after 2 hours.',
    refund_eta: '1 hour 45 mins',
    notes: null,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 7200000).toISOString(),
    closed_at: null,
    transaction: {
      id: 'tx-2003',
      amount: 15000,
      currency: 'INR',
      sender_bank: 'HDFC',
      receiver_bank: 'AXIS',
      status: 'FAILED',
      route_path: ['HDFC', 'NPCI', 'AXIS'],
      latency_ms: 1200,
      error_code: 'ACQUIRER_503_OUTAGE',
      error_message: 'Acquirer bank 503 Service Unavailable',
      root_cause: 'AXIS settlement gateway downtime',
      affected_component: 'SETTLEMENT_GATEWAY',
      rca_confidence: 0.95,
      expected_reversal: '2 hours',
      reversal_confidence: 90.0,
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    customer: { id: 'cust-503', name: 'Amit Verma', phone: '+91 91234 56789', email: 'amit.verma@example.com' }
  }
];

/**
 * GET /api/cases
 * Fetches real support cases from Neon DB (support_cases JOIN transactions JOIN users).
 * Falls back to MOCK_CASES if DB is unreachable or empty.
 */
export async function GET() {
  const pool = getPgPool();

  if (pool) {
    try {
      const result = await pool.query(`
        SELECT
          sc.id,
          sc.transaction_id::text,
          sc.customer_id::text,
          sc.agent_id,
          sc.status,
          sc.ai_rca_summary,
          sc.ai_suggested_response,
          sc.ai_escalation_recommendation,
          sc.refund_eta,
          sc.notes,
          sc.created_at,
          sc.updated_at,
          sc.closed_at,
          -- Transaction fields
          t.id::text              AS tx_id,
          t.amount,
          t.currency,
          t.sender_bank,
          t.receiver_bank,
          t.status                AS tx_status,
          t.route_path,
          t.latency_ms,
          t.error_code,
          t.error_message,
          t.root_cause,
          t.affected_component,
          t.rca_confidence,
          t.expected_reversal,
          t.reversal_confidence,
          t.created_at            AS tx_created_at,
          -- Customer fields
          u.id::text              AS customer_db_id,
          u.name                  AS customer_name,
          u.phone                 AS customer_phone,
          u.email                 AS customer_email
        FROM support_cases sc
        JOIN transactions t ON sc.transaction_id = t.id
        LEFT JOIN users u ON sc.customer_id = u.id
        ORDER BY sc.created_at DESC
        LIMIT 50
      `);

      if (result.rows.length > 0) {
        const cases = result.rows.map((row) => ({
          id: row.id,
          transaction_id: row.transaction_id,
          customer_id: row.customer_id,
          agent_id: row.agent_id,
          status: row.status,
          ai_rca_summary: row.ai_rca_summary,
          ai_suggested_response: row.ai_suggested_response,
          ai_escalation_recommendation: row.ai_escalation_recommendation,
          refund_eta: row.refund_eta,
          notes: row.notes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          closed_at: row.closed_at,
          transaction: {
            id: row.tx_id,
            amount: Number(row.amount),
            currency: row.currency,
            sender_bank: row.sender_bank,
            receiver_bank: row.receiver_bank,
            status: row.tx_status,
            route_path: row.route_path || [],
            latency_ms: row.latency_ms,
            error_code: row.error_code,
            error_message: row.error_message,
            root_cause: row.root_cause,
            affected_component: row.affected_component,
            rca_confidence: row.rca_confidence,
            expected_reversal: row.expected_reversal,
            reversal_confidence: row.reversal_confidence,
            created_at: row.tx_created_at,
          },
          customer: row.customer_db_id
            ? {
                id: row.customer_db_id,
                name: row.customer_name,
                phone: row.customer_phone,
                email: row.customer_email,
              }
            : null,
        }));

        return NextResponse.json(cases);
      }

      // DB accessible but empty — return MOCK_CASES as seed
      console.info('[cases/route] No real cases in DB yet — returning mock seed data.');
      return NextResponse.json(MOCK_CASES);
    } catch (err) {
      console.error('[cases/route] DB query error, falling back to mock data:', err);
    }
  }

  return NextResponse.json(MOCK_CASES);
}

/**
 * POST /api/cases
 * Updates case status / notes. Writes to DB if available, otherwise mocks.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { caseId, status, notes } = body;

    if (!caseId) {
      return NextResponse.json({ error: 'Missing caseId' }, { status: 400 });
    }

    const pool = getPgPool();
    if (pool) {
      try {
        const setClauses = [];
        const values: any[] = [];
        let idx = 1;

        if (status) { setClauses.push(`status = $${idx++}`); values.push(status); }
        if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(notes); }
        if (status === 'RESOLVED') { setClauses.push(`closed_at = NOW()`); }
        setClauses.push(`updated_at = NOW()`);
        values.push(caseId);

        const res = await pool.query(
          `UPDATE support_cases SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, status, notes, updated_at, closed_at`,
          values
        );

        if (res.rows.length > 0) {
          return NextResponse.json(res.rows[0]);
        }
      } catch (dbErr) {
        console.error('[cases/route POST] DB update error:', dbErr);
      }
    }

    // Mock fallback
    const mockCase = MOCK_CASES.find((c) => c.id === caseId);
    if (mockCase) {
      return NextResponse.json({
        ...mockCase,
        status: status || mockCase.status,
        notes: notes !== undefined ? notes : mockCase.notes,
        closed_at: status === 'RESOLVED' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  } catch (error) {
    console.error('[cases/route POST] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
