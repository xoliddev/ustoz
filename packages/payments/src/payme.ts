/**
 * Payme Merchant API (JSON-RPC 2.0 over HTTPS; Payme calls us). Authorization: Basic base64("Paycom:<key>").
 * Amounts are tiyin. account.payment_id is our pending payment's id.
 * Methods: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction,
 * CheckTransaction, GetStatement. Transaction states: 1 created, 2 performed, -1/-2 cancelled.
 */
import { base64, isDomainError, timingSafeEqual } from '@ustoz/core';
import { assertSandbox, type Ledger, type PaymeConfig } from './types';

export const PAYME_ERRORS = {
  INVALID_AMOUNT: -31001,
  TXN_NOT_FOUND: -31003,
  CANT_CANCEL: -31007,
  CANT_PERFORM: -31008,
  ACCOUNT: -31050,
  BUSY: -31099,
  METHOD_NOT_FOUND: -32601,
  INVALID_JSON: -32700,
  AUTH: -32504,
} as const;

/** A created transaction expires after 12 hours (Payme's rule). */
export const PAYME_TIMEOUT_MS = 12 * 3600 * 1000;

type Rpc = { id?: unknown; method?: unknown; params?: Record<string, unknown> };
const msg = (en: string, uz: string, ru: string) => ({ en, uz, ru });
const err = (id: unknown, code: number, message: ReturnType<typeof msg>, data?: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });

export function paymeAuthHeader(key: string): string {
  return `Basic ${base64(`Paycom:${key}`)}`;
}

export async function handlePayme(ledger: Ledger, cfg: PaymeConfig, req: { authorization?: string; body: unknown }, now: Date): Promise<Record<string, unknown>> {
  assertSandbox(cfg, 'Payme');
  const rpc = (req.body ?? {}) as Rpc;
  if (!req.authorization || !timingSafeEqual(req.authorization, paymeAuthHeader(cfg.key))) return err(rpc.id, PAYME_ERRORS.AUTH, msg('Insufficient privileges', 'Ruxsat yo\'q', 'Недостаточно привилегий'));
  if (typeof rpc.method !== 'string' || typeof rpc.params !== 'object' || rpc.params === null) return err(rpc.id, PAYME_ERRORS.INVALID_JSON, msg('Invalid request', 'Noto\'g\'ri so\'rov', 'Неверный запрос'));
  const p = rpc.params;
  const account = (p.account ?? {}) as Record<string, unknown>;
  const amount = Number(p.amount);
  const txnId = String(p.id ?? '');

  const checkPayment = async (): Promise<ReturnType<typeof err> | null> => {
    const pay = await ledger.getPayment(String(account.payment_id ?? ''));
    if (!pay || pay.status !== 'pending') return err(rpc.id, PAYME_ERRORS.ACCOUNT, msg('Payment not found', 'To\'lov topilmadi', 'Платёж не найден'), 'payment_id');
    if (!Number.isSafeInteger(amount) || amount !== pay.amount) return err(rpc.id, PAYME_ERRORS.INVALID_AMOUNT, msg('Wrong amount', 'Noto\'g\'ri summa', 'Неверная сумма'));
    return null;
  };
  const view = (t: { createdAt: string; performedAt: string | null; cancelledAt: string | null; state: number; reason: number | null; id: string }) => ({
    create_time: Date.parse(t.createdAt), perform_time: t.performedAt ? Date.parse(t.performedAt) : 0, cancel_time: t.cancelledAt ? Date.parse(t.cancelledAt) : 0,
    transaction: t.id, state: t.state, reason: t.reason,
  });

  try {
    switch (rpc.method) {
      case 'CheckPerformTransaction': {
        const e = await checkPayment();
        return e ?? ok(rpc.id, { allow: true });
      }
      case 'CreateTransaction': {
        const existing = await ledger.getTxn('payme', txnId);
        if (existing) {
          if (existing.state !== 1) return err(rpc.id, PAYME_ERRORS.CANT_PERFORM, msg('Transaction is not active', 'Tranzaksiya faol emas', 'Транзакция неактивна'));
          if (now.getTime() - Date.parse(existing.createdAt) > PAYME_TIMEOUT_MS) {
            await ledger.cancelTxn('payme', txnId, 4, now);
            return err(rpc.id, PAYME_ERRORS.CANT_PERFORM, msg('Transaction timed out', 'Vaqt tugadi', 'Время истекло'));
          }
          return ok(rpc.id, { create_time: Date.parse(existing.createdAt), transaction: existing.id, state: existing.state });
        }
        const e = await checkPayment();
        if (e) return e;
        const t = await ledger.createTxn('payme', txnId, String(account.payment_id), amount, new Date(Number(p.time) || now.getTime()));
        return ok(rpc.id, { create_time: Date.parse(t.createdAt), transaction: t.id, state: t.state });
      }
      case 'PerformTransaction': {
        const t = await ledger.getTxn('payme', txnId);
        if (!t) return err(rpc.id, PAYME_ERRORS.TXN_NOT_FOUND, msg('Transaction not found', 'Tranzaksiya topilmadi', 'Транзакция не найдена'));
        if (t.state === 1 && now.getTime() - Date.parse(t.createdAt) > PAYME_TIMEOUT_MS) {
          await ledger.cancelTxn('payme', txnId, 4, now);
          return err(rpc.id, PAYME_ERRORS.CANT_PERFORM, msg('Transaction timed out', 'Vaqt tugadi', 'Время истекло'));
        }
        if (t.state < 0) return err(rpc.id, PAYME_ERRORS.CANT_PERFORM, msg('Transaction is cancelled', 'Bekor qilingan', 'Отменена'));
        const done = await ledger.performTxn('payme', txnId, now);
        return ok(rpc.id, { transaction: done.id, perform_time: Date.parse(done.performedAt!), state: done.state });
      }
      case 'CancelTransaction': {
        const t = await ledger.getTxn('payme', txnId);
        if (!t) return err(rpc.id, PAYME_ERRORS.TXN_NOT_FOUND, msg('Transaction not found', 'Tranzaksiya topilmadi', 'Транзакция не найдена'));
        const c = await ledger.cancelTxn('payme', txnId, Number(p.reason) || 0, now);
        return ok(rpc.id, { transaction: c.id, cancel_time: Date.parse(c.cancelledAt!), state: c.state });
      }
      case 'CheckTransaction': {
        const t = await ledger.getTxn('payme', txnId);
        if (!t) return err(rpc.id, PAYME_ERRORS.TXN_NOT_FOUND, msg('Transaction not found', 'Tranzaksiya topilmadi', 'Транзакция не найдена'));
        return ok(rpc.id, view(t));
      }
      case 'GetStatement': {
        const list = await ledger.listTxns('payme', new Date(Number(p.from)), new Date(Number(p.to)));
        return ok(rpc.id, { transactions: list.map((t) => ({ id: t.providerTxnId, time: Date.parse(t.createdAt), amount: t.amount, account: { payment_id: t.paymentId }, ...view(t) })) });
      }
      default:
        return err(rpc.id, PAYME_ERRORS.METHOD_NOT_FOUND, msg('Method not found', 'Metod topilmadi', 'Метод не найден'));
    }
  } catch (e) {
    if (isDomainError(e) && e.details.reason === 'BUSY') return err(rpc.id, PAYME_ERRORS.BUSY, msg('Payment is being processed', 'To\'lov jarayonda', 'Платёж обрабатывается'));
    throw e;
  }
}

/** Sandbox checkout link (test.paycom.uz) the payer would open. */
export function paymeCheckoutUrl(cfg: PaymeConfig, paymentId: string, amount: number): string {
  assertSandbox(cfg, 'Payme');
  return `https://checkout.test.paycom.uz/${base64(`m=${cfg.merchantId};ac.payment_id=${paymentId};a=${amount}`)}`;
}
