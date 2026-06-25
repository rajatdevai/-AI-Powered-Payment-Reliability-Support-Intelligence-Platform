import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import type { BankCode } from '../simulators/bank.simulator';

export interface CreateTransactionInput {
  sender_bank: BankCode;
  receiver_bank: BankCode;
  amount: number;
  currency?: string | undefined;
  psp_id?: string | undefined;
  merchant_id?: string | undefined;
  user_id?: string | undefined;
  route_path: string[];
}

export interface UpdateTransactionResult {
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'REVERSED';
  latency_ms?: number | undefined;
  error_code?: string | null | undefined;
  error_message?: string | null | undefined;
  settled_at?: Date | undefined;
}

export const transactionService = {
  async create(input: CreateTransactionInput) {
    return db.transaction.create({
      data: {
        id: uuidv4(),
        amount: input.amount,
        currency: input.currency ?? 'INR',
        sender_bank: input.sender_bank,
        receiver_bank: input.receiver_bank,
        psp_id: input.psp_id ?? null,
        merchant_id: input.merchant_id ?? null,
        user_id: input.user_id ?? null,
        status: 'PENDING',
        route_path: input.route_path,
      },
    });
  },

  async updateResult(id: string, result: UpdateTransactionResult) {
    return db.transaction.update({
      where: { id },
      data: {
        status: result.status,
        latency_ms: result.latency_ms ?? null,
        error_code: result.error_code ?? null,
        error_message: result.error_message ?? null,
        settled_at: result.status === 'SUCCESS' ? (result.settled_at ?? new Date()) : null,
      },
    });
  },

  async findById(id: string) {
    return db.transaction.findUnique({ where: { id } });
  },

  async findByStatus(status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT', limit = 50) {
    return db.transaction.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  },

  async getStats() {
    const [total, success, failed, pending] = await Promise.all([
      db.transaction.count(),
      db.transaction.count({ where: { status: 'SUCCESS' } }),
      db.transaction.count({ where: { status: 'FAILED' } }),
      db.transaction.count({ where: { status: 'PENDING' } }),
    ]);

    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0';

    return { total, success, failed, pending, success_rate: parseFloat(successRate) };
  },
};
