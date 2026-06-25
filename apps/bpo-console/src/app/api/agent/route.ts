import { NextResponse } from 'next/server';
import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Pool } from 'pg';

const PROTO_PATH = path.resolve(
  process.cwd(),
  '../../shared/protobuf/agent.proto'
);

// ── gRPC client (lazy singleton) ────────────────────────────────────────────
let gRpcClient: any = null;

function getGrpcClient() {
  if (gRpcClient) return gRpcClient;
  try {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    const client = new protoDescriptor.prism.agent.AgentService(
      '127.0.0.1:50053',
      grpc.credentials.createInsecure(),
      { 'grpc.max_receive_message_length': 4 * 1024 * 1024 }
    );
    gRpcClient = client;
    return client;
  } catch (error) {
    console.warn('gRPC init error (falling back to DB context):', error);
    return null;
  }
}

// ── PostgreSQL pool (lazy singleton) ────────────────────────────────────────
let pgPool: Pool | null = null;

function getPgPool(): Pool | null {
  if (pgPool) return pgPool;
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('DATABASE_URL not set — DB context fallback disabled.');
    return null;
  }
  pgPool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  return pgPool;
}

// ── Context builder — queries Postgres directly ──────────────────────────────
async function buildContextFromDB(txId?: string): Promise<{
  txInfo: any;
  contextText: string;
  source: string;
}> {
  const pool = getPgPool();
  if (!pool) {
    return { txInfo: null, contextText: 'Database connection unavailable.', source: 'none' };
  }

  let txInfo: any = null;
  let source = 'none';

  const FULL_TX_QUERY = `
    SELECT
      t.id::text,
      t.amount,
      t.currency,
      t.sender_bank,
      t.receiver_bank,
      t.status,
      t.route_path,
      t.latency_ms,
      t.error_code,
      t.error_message,
      t.created_at,
      r.root_cause,
      r.affected_component,
      r.confidence          AS rca_confidence,
      r.llm_summary         AS rca_llm_summary,
      rev.refund_eta,
      rev.reversal_confidence,
      rev.bank_behavior_note
    FROM transactions t
    LEFT JOIN rca_reports          r   ON t.id = r.transaction_id
    LEFT JOIN reversal_predictions rev ON t.id = rev.transaction_id
    WHERE t.id = $1
  `;

  const LATEST_FAILED_QUERY = `
    SELECT
      t.id::text,
      t.amount,
      t.currency,
      t.sender_bank,
      t.receiver_bank,
      t.status,
      t.route_path,
      t.latency_ms,
      t.error_code,
      t.error_message,
      t.created_at,
      r.root_cause,
      r.affected_component,
      r.confidence          AS rca_confidence,
      r.llm_summary         AS rca_llm_summary,
      rev.refund_eta,
      rev.reversal_confidence,
      rev.bank_behavior_note
    FROM transactions t
    LEFT JOIN rca_reports          r   ON t.id = r.transaction_id
    LEFT JOIN reversal_predictions rev ON t.id = rev.transaction_id
    WHERE t.status IN ('FAILED', 'TIMEOUT')
    ORDER BY t.created_at DESC
    LIMIT 1
  `;

  try {
    if (txId) {
      const res = await pool.query(FULL_TX_QUERY, [txId]);
      if (res.rows.length > 0) {
        txInfo = res.rows[0];
        source = 'explicit';
      }
    }

    // Auto-fallback to most recent failed transaction
    if (!txInfo) {
      const res = await pool.query(LATEST_FAILED_QUERY);
      if (res.rows.length > 0) {
        txInfo = res.rows[0];
        source = 'auto_latest';
      }
    }
  } catch (err) {
    console.error('DB context query error:', err);
  }

  // Build structured context text
  let contextText = '';
  if (txInfo) {
    const autoNote = source === 'auto_latest' ? ' [AUTO-LOADED: most recent failed transaction]' : '';
    const route = Array.isArray(txInfo.route_path) ? txInfo.route_path.join(' → ') : txInfo.route_path ?? 'N/A';
    const rcaConf = txInfo.rca_confidence != null ? `${Math.round(txInfo.rca_confidence * 100)}%` : 'N/A';

    contextText = [
      `=== TRANSACTION CONTEXT${autoNote} ===`,
      `Transaction ID : ${txInfo.id}`,
      `Status         : ${txInfo.status}`,
      `Amount         : ${txInfo.amount} ${txInfo.currency}`,
      `Sender Bank    : ${txInfo.sender_bank}`,
      `Receiver Bank  : ${txInfo.receiver_bank}`,
      `Route Path     : ${route}`,
      `Latency        : ${txInfo.latency_ms ?? 'N/A'} ms`,
      '',
      `=== FAILURE DETAILS ===`,
      `Error Code     : ${txInfo.error_code ?? 'N/A'}`,
      `Error Message  : ${txInfo.error_message ?? 'None recorded'}`,
      '',
      `=== ROOT CAUSE ANALYSIS ===`,
      `Root Cause     : ${txInfo.root_cause ?? 'Analysis pending'}`,
      `Affected Layer : ${txInfo.affected_component ?? 'Unknown'}`,
      `RCA Confidence : ${rcaConf}`,
      `RCA Summary    : ${txInfo.rca_llm_summary ?? 'Not yet generated'}`,
      '',
      `=== REVERSAL & REFUND INFO ===`,
      `Refund ETA     : ${txInfo.refund_eta ?? '24 hours'}`,
      `Reversal Conf. : ${txInfo.reversal_confidence ?? 'N/A'}`,
      `Bank Note      : ${txInfo.bank_behavior_note ?? 'N/A'}`,
    ].join('\n');
  } else {
    contextText = 'No transaction data found in the database. Ask the customer for their transaction ID.';
  }

  return { txInfo, contextText, source };
}

// ── CORS helpers ─────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { session_id, message, transaction_id, incident_id, persona: personaStr } = body;
  const client = getGrpcClient();

  // Map persona string to proto enum: 0=CUSTOMER, 1=OPS_ENGINEER, 2=BPO_AGENT
  const PERSONA_MAP: Record<string, number> = {
    CUSTOMER: 0,
    OPS_ENGINEER: 1,
    BPO_AGENT: 2,
  };
  const personaNum = personaStr && PERSONA_MAP[personaStr.toUpperCase()] !== undefined
    ? PERSONA_MAP[personaStr.toUpperCase()]
    : 2; // Default: BPO_AGENT for BPO console
  const encoder = new TextEncoder();

  // ── Path A: gRPC to Python agent-service (preferred) ────────────────────
  if (client) {
    try {
      const stream = new ReadableStream({
        async start(controller) {
          const call = client.RunAgentQueryStream({
            session_id: session_id || 'bpo-default-session',
            persona: personaNum,
            message: message || '',
            transaction_id: transaction_id || '',
            incident_id: incident_id || '',
          });

          call.on('data', (chunk: any) => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  text: chunk.chunk_text,
                  agent: chunk.agent_name || 'BPO Copilot Agent',
                  is_final: chunk.is_final || false,
                })}\n\n`
              )
            );
          });

          call.on('end', () => controller.close());
          call.on('error', (err: any) => {
            console.error('gRPC stream error:', err);
            controller.close();
          });
        },
      });
      return new Response(stream, { headers: corsHeaders() });
    } catch (grpcErr) {
      console.warn('gRPC stream failed, falling through to DB fallback:', grpcErr);
    }
  }

  // ── Path B: DB-aware context fallback (no gRPC, no LLM hallucination) ───
  const { txInfo, contextText, source } = await buildContextFromDB(transaction_id);
  const userMsg = (message || '').toLowerCase();
  let finalResponse = '';
  const respondingAgent = 'BPO Copilot Agent (DB Fallback)';

  if (txInfo) {
    const txId = txInfo.id;
    const refundEta = txInfo.refund_eta ?? '24 hours';
    const errorCode = txInfo.error_code ?? 'N/A';
    const errorMsg = txInfo.error_message ?? 'gateway error';
    const rootCause = txInfo.root_cause ?? 'analysis pending';
    const affectedComp = txInfo.affected_component ?? 'UNKNOWN';
    const rcaConf = txInfo.rca_confidence != null ? `${Math.round(txInfo.rca_confidence * 100)}%` : 'N/A';
    const autoNote = source === 'auto_latest' ? ' (auto-loaded latest failed transaction)' : '';

    if (userMsg.includes('refund') || userMsg.includes('eta') || userMsg.includes('reversal') || userMsg.includes('when') || userMsg.includes('credit')) {
      finalResponse = `Refund ETA for transaction ${txId}${autoNote}: ${refundEta}. Reversal confidence: ${txInfo.reversal_confidence ?? 'N/A'}%. ${txInfo.bank_behavior_note ?? ''}`;
    } else if (userMsg.includes('why') || userMsg.includes('fail') || userMsg.includes('error') || userMsg.includes('cause') || userMsg.includes('debit')) {
      finalResponse = `Transaction ${txId}${autoNote} failed due to: "${errorMsg}" (Error Code: ${errorCode}). Root cause: ${rootCause} — affecting component: ${affectedComp} (RCA confidence: ${rcaConf}). Funds will be reversed automatically in ${refundEta}.`;
    } else if (userMsg.includes('route') || userMsg.includes('path') || userMsg.includes('hops') || userMsg.includes('latency')) {
      const route = Array.isArray(txInfo.route_path) ? txInfo.route_path.join(' → ') : txInfo.route_path ?? 'N/A';
      finalResponse = `Transaction ${txId}${autoNote} routed through: ${route}. Observed latency: ${txInfo.latency_ms ?? 'N/A'}ms. Failure occurred at ${affectedComp}.`;
    } else if (userMsg.includes('rca') || userMsg.includes('analysis') || userMsg.includes('diagnos')) {
      finalResponse = `RCA Report for ${txId}${autoNote}: Root cause identified as "${rootCause}" in component "${affectedComp}". Confidence: ${rcaConf}. ${txInfo.rca_llm_summary ?? ''}`;
    } else {
      // General summary — full context
      finalResponse = `Context loaded for transaction ${txId}${autoNote}:\n${contextText}`;
    }
  } else {
    finalResponse =
      'No transaction records found in the database. Please select a case from the ledger or provide a specific transaction ID to begin investigation.';
  }

  // Stream the fallback response word-by-word
  const words = finalResponse.split(' ');
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < words.length; i++) {
        const chunkText = i === words.length - 1 ? words[i] : words[i] + ' ';
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              text: chunkText,
              agent: respondingAgent,
              is_final: i === words.length - 1,
              source,
              traces: [
                {
                  agent_name: 'Supervisor Agent',
                  message: `DB fallback active (gRPC unavailable). Context source: ${source}.`,
                  timestamp: new Date().toISOString(),
                },
                {
                  agent_name: 'Context Builder',
                  message: `Queried PostgreSQL. TX found: ${txInfo ? txInfo.id : 'none'}.`,
                  timestamp: new Date().toISOString(),
                },
              ],
            })}\n\n`
          )
        );
        await new Promise((r) => setTimeout(r, 25));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: corsHeaders() });
}
