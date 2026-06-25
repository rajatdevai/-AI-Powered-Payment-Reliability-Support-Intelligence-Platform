import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { transactionService } from '../services/transaction.service';
import { predictionClient } from '../services/prediction.client';
import { routingService } from '../services/routing.service';
import { kafkaService } from '../services/kafka.service';
import { bankSimulator, type BankCode, type NetworkCondition } from '../simulators/bank.simulator';
import { npciSimulator, type NPCICondition } from '../simulators/npci.simulator';
import { db } from '../services/db';

// ── Request/Response schemas ────────────────────────────────────────────────

const InitiatePaymentSchema = z.object({
  sender_bank: z.enum(['HDFC', 'ICICI', 'SBI', 'AXIS', 'YESBANK']),
  receiver_bank: z.enum(['HDFC', 'ICICI', 'SBI', 'AXIS', 'YESBANK']),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().default('INR'),
  merchant_id: z.string().optional(),
  user_id: z.string().optional(),
  psp_id: z.string().optional(),
});

const ConfirmPaymentSchema = z.object({
  transaction_id: z.string().uuid(),
});

const SetBankConditionSchema = z.object({
  bank_code: z.enum(['HDFC', 'ICICI', 'SBI', 'AXIS', 'YESBANK']),
  condition: z.enum(['HEALTHY', 'LATENCY_SPIKE', 'TIMEOUT_FLURRY', 'OUTAGE']),
});

const SetNPCIConditionSchema = z.object({
  condition: z.enum(['HEALTHY', 'LATENCY_SPIKE', 'TIMEOUT', 'OUTAGE']),
});

// ── Route registration ──────────────────────────────────────────────────────

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /payments/initiate
   *
   * Step 1 of checkout flow.
   * Calls prediction-engine for success probability.
   * Creates a PENDING transaction.
   * Publishes payment.initiated to Kafka.
   * Returns prediction + transaction_id for the confirm step.
   */
  app.post(
    '/payments/initiate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = InitiatePaymentSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          details: parseResult.error.format(),
        });
      }

      const body = parseResult.data;

      if (body.sender_bank === body.receiver_bank) {
        return reply.status(400).send({
          error: 'INVALID_ROUTE',
          message: 'Sender and receiver bank cannot be the same',
        });
      }

      // 1. Get prediction (gRPC → Python or local fallback)
      const prediction = await predictionClient.predict({
        sender_bank: body.sender_bank,
        receiver_bank: body.receiver_bank,
        amount: body.amount,
        currency: body.currency,
      });

      // 2. Select route
      const route = await routingService.selectBestRoute(
        body.sender_bank,
        body.receiver_bank
      );

      // 3. Create PENDING transaction in Postgres
      const transaction = await transactionService.create({
        sender_bank: body.sender_bank,
        receiver_bank: body.receiver_bank,
        amount: body.amount,
        currency: body.currency,
        psp_id: body.psp_id ?? route.selected_psp,
        merchant_id: body.merchant_id,
        user_id: body.user_id,
        route_path: route.route_path,
      });

      // 4. Publish payment.initiated
      await kafkaService.publish('payment.initiated', {
        event_type: 'payment.initiated',
        correlation_id: transaction.id,
        transaction_id: transaction.id,
        amount: body.amount,
        currency: body.currency,
        sender_bank: body.sender_bank,
        receiver_bank: body.receiver_bank,
        route_path: route.route_path,
        psp_id: route.selected_psp,
      });

      return reply.status(201).send({
        transaction_id: transaction.id,
        status: 'PENDING',
        prediction,
        route: {
          path: route.route_path,
          health_score: route.health_score,
          selected_psp: route.selected_psp,
        },
        created_at: transaction.created_at,
      });
    }
  );

  /**
   * POST /payments/confirm
   *
   * Step 2 of checkout flow.
   * User has seen the prediction and chooses to proceed.
   * Executes the payment simulation (NPCI → Banks).
   * Updates transaction status.
   * Publishes payment.success or payment.failed.
   */
  app.post(
    '/payments/confirm',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = ConfirmPaymentSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'VALIDATION_ERROR',
          details: parseResult.error.format(),
        });
      }

      const { transaction_id } = parseResult.data;

      const transaction = await transactionService.findById(transaction_id);
      if (!transaction) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: `Transaction ${transaction_id} not found`,
        });
      }

      if (transaction.status !== 'PENDING') {
        return reply.status(409).send({
          error: 'INVALID_STATE',
          message: `Transaction is already ${transaction.status}`,
          current_status: transaction.status,
        });
      }

      const senderBank = transaction.sender_bank as BankCode;
      const receiverBank = transaction.receiver_bank as BankCode;
      const amount = Number(transaction.amount);

      // ── Check route-level forced failure (demo scenarios) ──────────────
      const forcedFail = bankSimulator.checkForceFailRoute(senderBank, receiverBank);
      if (forcedFail) {
        const totalLatency = forcedFail.latency_ms;
        const updatedTx = await transactionService.updateResult(transaction_id, {
          status: 'FAILED',
          latency_ms: totalLatency,
          error_code: forcedFail.error_code,
          error_message: forcedFail.error_message,
          settled_at: undefined,
        });

        // Auto-create support case
        try {
          await db.supportCase.create({
            data: {
              id: uuidv4(),
              transaction_id,
              customer_id: null,
              status: 'OPEN',
              ai_rca_summary: `Payment FAILED due to ${forcedFail.error_message} (Error: ${forcedFail.error_code}). Route ${senderBank}→${receiverBank} is currently blocked.`,
              ai_suggested_response: `Dear Customer, your payment of ₹${amount} from ${senderBank} to ${receiverBank} failed because the route is temporarily blocked for maintenance. Reversal SLA has been triggered and your funds will be refunded within 15 minutes.`,
              ai_escalation_recommendation: `Route ${senderBank}→${receiverBank} is force-blocked in demo mode. Verify route unblock before production traffic.`,
              refund_eta: '15 minutes',
              notes: `Force-fail route active for ${senderBank}→${receiverBank}.`,
            }
          });
        } catch (_) { /* ignore */ }

        await kafkaService.publish('payment.failed', {
          event_type: 'payment.failed',
          event_id: uuidv4(),
          correlation_id: transaction_id,
          transaction_id,
          amount,
          currency: transaction.currency,
          sender_bank: senderBank,
          receiver_bank: receiverBank,
          route_path: transaction.route_path,
          latency_ms: totalLatency,
          error_code: forcedFail.error_code,
          error_message: forcedFail.error_message,
        });

        return reply.send({
          transaction: { ...updatedTx, amount },
          simulation: {
            npci_status: 'FORCED_FAIL',
            npci_latency_ms: 0,
            total_latency_ms: totalLatency,
            route_path: transaction.route_path,
            forced_fail_route: `${senderBank}→${receiverBank}`,
          },
        });
      }
      // ──────────────────────────────────────────────────────────────────

      // Execute simulation: NPCI routing first, then sender bank, then receiver bank
      const startTime = Date.now();

      const npciResult = await npciSimulator.route(senderBank, receiverBank);

      let finalStatus: 'SUCCESS' | 'FAILED' | 'TIMEOUT' = 'FAILED';
      let errorCode: string | null = null;
      let errorMessage: string | null = null;

      if (npciResult.status === 'ROUTED') {
        // NPCI routed — now simulate sender bank authorisation
        const senderResult = await bankSimulator.processTransaction(senderBank, 'SENDER', amount);

        if (senderResult.status === 'SUCCESS') {
          // Sender authorised — simulate receiver bank settlement
          const receiverResult = await bankSimulator.processTransaction(receiverBank, 'RECEIVER', amount);

          if (receiverResult.status === 'SUCCESS') {
            finalStatus = 'SUCCESS';
          } else {
            finalStatus = receiverResult.status === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED';
            errorCode = receiverResult.error_code;
            errorMessage = receiverResult.error_message;
          }
        } else {
          finalStatus = senderResult.status === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED';
          errorCode = senderResult.error_code;
          errorMessage = senderResult.error_message;
        }
      } else if (npciResult.status === 'TIMEOUT') {
        finalStatus = 'TIMEOUT';
        errorCode = npciResult.error_code;
        errorMessage = 'NPCI switch timeout — transaction not processed';
      } else {
        finalStatus = 'FAILED';
        errorCode = npciResult.error_code;
        errorMessage = 'NPCI switch rejected transaction';
      }

      const totalLatency = Date.now() - startTime;

      // Update Postgres
      const updatedTx = await transactionService.updateResult(transaction_id, {
        status: finalStatus === 'TIMEOUT' ? 'FAILED' : finalStatus,
        latency_ms: totalLatency,
        error_code: errorCode,
        error_message: errorMessage,
        settled_at: finalStatus === 'SUCCESS' ? new Date() : undefined,
      });

      // If payment failed, auto-create a support case in the database
      if (finalStatus !== 'SUCCESS') {
        try {
          const expectedReversal = finalStatus === 'TIMEOUT' ? '15 minutes' : '2 hours';
          await db.supportCase.create({
            data: {
              id: uuidv4(),
              transaction_id,
              customer_id: null,           // No users in DB — nullable field
              status: 'OPEN',
              ai_rca_summary: `Payment ${finalStatus.toLowerCase()} due to ${errorMessage || 'Unknown Error'} (Error: ${errorCode || 'UNKNOWN_ERROR'}).`,
              ai_suggested_response: `Dear Customer, your payment of ₹${amount} failed due to ${errorMessage || 'Unknown Error'}. Your funds are safe and will be refunded within ${expectedReversal}.`,
              ai_escalation_recommendation: `Verify route connectivity for ${senderBank}→${receiverBank}. Error: ${errorCode}.`,
              refund_eta: expectedReversal,
              notes: 'Auto-generated case from payment failure.',
            }
          });
          app.log.info({ transaction_id }, 'Auto-created support case for failed transaction');
        } catch (err) {
          app.log.warn({ err }, 'Failed to auto-create support case — will be caught by backfill');
        }
      }

      // Publish Kafka event
      const kafkaTopic = finalStatus === 'SUCCESS' ? 'payment.success' : 'payment.failed';
      await kafkaService.publish(kafkaTopic, {
        event_type: kafkaTopic,
        event_id: uuidv4(),
        correlation_id: transaction_id,
        transaction_id,
        amount,
        currency: transaction.currency,
        sender_bank: senderBank,
        receiver_bank: receiverBank,
        route_path: transaction.route_path,
        latency_ms: totalLatency,
        error_code: errorCode,
        error_message: errorMessage,
      });

      return reply.send({
        transaction: {
          ...updatedTx,
          amount: Number(updatedTx.amount),
        },
        simulation: {
          npci_status: npciResult.status,
          npci_latency_ms: npciResult.latency_ms,
          total_latency_ms: totalLatency,
          route_path: npciResult.route_path,
        },
      });
    }
  );

  /**
   * GET /payments/:id
   * Fetch a transaction by ID.
   */
  app.get(
    '/payments/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = req.params;

      const transaction = await transactionService.findById(id);
      if (!transaction) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: `Transaction ${id} not found`,
        });
      }

      return reply.send({
        ...transaction,
        amount: Number(transaction.amount),
      });
    }
  );

  /**
   * GET /payments/list
   * Returns the 20 most recent transactions (any status) for the Customer Portal.
   */
  app.get('/payments/list', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const txs = await db.transaction.findMany({
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          amount: true,
          currency: true,
          sender_bank: true,
          receiver_bank: true,
          status: true,
          route_path: true,
          latency_ms: true,
          error_code: true,
          error_message: true,
          expected_reversal: true,
          root_cause: true,
          affected_component: true,
          rca_confidence: true,
          reversal_confidence: true,
          created_at: true,
        },
      });
      return reply.send({
        transactions: txs.map((t) => ({ ...t, amount: Number(t.amount) })),
        total: txs.length,
      });
    } catch (err) {
      app.log.error({ err }, 'Failed to list transactions');
      return reply.status(500).send({ error: 'Failed to list transactions', transactions: [] });
    }
  });

  /**
   * GET /payments/stats
   * Aggregate transaction statistics.
   */
  app.get('/payments/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const stats = await transactionService.getStats();
    return reply.send(stats);
  });

  // ── Debug / Demo control endpoints ───────────────────────────────────────

  /**
   * POST /debug/bank-condition
   * Override bank network condition for demo purposes.
   */
  app.post(
    '/debug/bank-condition',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SetBankConditionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.format() });
      }

      const { bank_code, condition } = parseResult.data;
      bankSimulator.setCondition(bank_code as BankCode, condition as NetworkCondition);

      return reply.send({
        message: `${bank_code} condition set to ${condition}`,
        all_conditions: bankSimulator.getAllConditions(),
      });
    }
  );

  /**
   * POST /debug/npci-condition
   * Override NPCI switch condition for demo purposes.
   */
  app.post(
    '/debug/npci-condition',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SetNPCIConditionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.format() });
      }

      npciSimulator.setCondition(parseResult.data.condition as NPCICondition);

      return reply.send({
        message: `NPCI condition set to ${parseResult.data.condition}`,
        npci_condition: npciSimulator.getCondition(),
      });
    }
  );

  /**
   * POST /debug/force-fail-route
   * Force a specific sender→receiver route to ALWAYS fail.
   * Body: { sender_bank, receiver_bank, error_code?, error_message? }
   * Use this for demo walkthroughs: e.g. always fail SBI→HDFC.
   */
  app.post(
    '/debug/force-fail-route',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { sender_bank, receiver_bank, error_code, error_message } = req.body as any;
      if (!sender_bank || !receiver_bank) {
        return reply.status(400).send({ error: 'sender_bank and receiver_bank are required' });
      }
      bankSimulator.setForceFailRoute(
        sender_bank as BankCode,
        receiver_bank as BankCode,
        error_code || 'ISSUER_SWITCH_REJECTED',
        error_message || `Transaction rejected — ${sender_bank}→${receiver_bank} route is blocked`,
      );
      app.log.info({ sender_bank, receiver_bank }, 'Force-fail route set');
      return reply.send({
        message: `✅ Route ${sender_bank}→${receiver_bank} is now FORCE FAILED for all transactions.`,
        active_force_fail_routes: bankSimulator.getForceFailRoutes(),
      });
    }
  );

  /**
   * DELETE /debug/force-fail-route
   * Clear a forced failure for a specific route.
   * Body: { sender_bank, receiver_bank } or omit both to clear ALL.
   */
  app.delete(
    '/debug/force-fail-route',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { sender_bank, receiver_bank } = (req.body as any) || {};
      if (sender_bank && receiver_bank) {
        bankSimulator.clearForceFailRoute(sender_bank as BankCode, receiver_bank as BankCode);
        return reply.send({ message: `Route ${sender_bank}→${receiver_bank} unblocked.`, active_force_fail_routes: bankSimulator.getForceFailRoutes() });
      }
      bankSimulator.clearAllForceFailRoutes();
      return reply.send({ message: 'All force-fail routes cleared.', active_force_fail_routes: {} });
    }
  );

  /**
   * GET /debug/simulator-status
   * Returns current simulator state including forced routes.
   */
  app.get('/debug/simulator-status', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      bank_conditions: bankSimulator.getAllConditions(),
      npci_condition: npciSimulator.getCondition(),
      force_fail_routes: bankSimulator.getForceFailRoutes(),
    });
  });
}
