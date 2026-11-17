/**
 * Uzum Bank merchant callbacks (JSON over HTTPS, Basic auth login:password): /check, /create, /confirm,
 * /reverse, /status. Body: { serviceId, timestamp, transId, params: { payment_id }, amount (tiyin) }.
 * Modelled on Uzum's published merchant API; field names follow it, sandbox only.
 */
import { base64, isDomainError, timingSafeEqual } from '@ustoz/core';
import { assertSandbox, type Ledger, type UzumConfig } from './types';

export type UzumOp = 'check' | 'create' | 'confirm' | 'reverse' | 'status';
export const UZUM_ERRORS = { AUTH: '10001', BAD_JSON: '10002', SERVICE: '10006', NOT_FOUND: '10007', AMOUNT: '10011', ALREADY: '10008', TXN_NOT_FOUND: '10014', STATE: '10016' } as const;
const STATUS: Record<number, string> = { 1: 'CREATED', 2: 'CONFIRMED', [-1]: 'FAILED', [-2]: 'REVERSED' };

export const uzumAuthHeader = (cfg: UzumConfig) => `Basic ${base64(`${cfg.login}:${cfg.password}`)}`;

export async function handleUzum(ledger: Ledger, cfg: UzumConfig, op: UzumOp, req: { authorization?: string; body: unknown }, now: Date): Promise<{ status: number; body: Record<string, unknown> }> {
  assertSandbox(cfg, 'Uzum');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const fail = (code: string, status = 400) => ({ status, body: { serviceId: b.serviceId ?? null, transId: b.transId ?? null, status: 'FAILED', transTime: now.getTime(), errorCode: code } });
  if (!req.authorization || !timingSafeEqual(req.authorization, uzumAuthHeader(cfg))) return fail(UZUM_ERRORS.AUTH, 401);
  if (String(b.serviceId) !== cfg.serviceId) return fail(UZUM_ERRORS.SERVICE);
  const transId = typeof b.transId === 'string' ? b.transId : '';
  const paymentId = String(((b.params ?? {}) as Record<string, unknown>).payment_id ?? '');
  const amount = Number(b.amount);
  const okBody = (extra: Record<string, unknown>) => ({ status: 200, body: { serviceId: b.serviceId, timestamp: now.getTime(), ...extra } });
  try {
    switch (op) {
      case 'check': {
        const pay = await ledger.getPayment(paymentId);
        if (!pay || pay.status !== 'pending') return fail(UZUM_ERRORS.NOT_FOUND);
        return okBody({ status: 'OK', data: { payment_id: { value: paymentId }, amount: { value: pay.amount } } });
      }
      case 'create': {
        if (!transId) return fail(UZUM_ERRORS.BAD_JSON);
        const pay = await ledger.getPayment(paymentId);
        if (!pay || pay.status !== 'pending') return fail(UZUM_ERRORS.NOT_FOUND);
        if (!Number.isSafeInteger(amount) || amount !== pay.amount) return fail(UZUM_ERRORS.AMOUNT);
        const t = await ledger.createTxn('uzum', transId, paymentId, amount, now);
        return okBody({ transId, status: STATUS[t.state], transTime: Date.parse(t.createdAt), amount: t.amount });
      }
      case 'confirm': {
        const t = await ledger.getTxn('uzum', transId);
        if (!t) return fail(UZUM_ERRORS.TXN_NOT_FOUND);
        if (t.state < 0) return fail(UZUM_ERRORS.STATE);
        const done = await ledger.performTxn('uzum', transId, now);
        return okBody({ transId, status: STATUS[done.state], confirmTime: Date.parse(done.performedAt!), amount: done.amount });
      }
      case 'reverse': {
        const t = await ledger.getTxn('uzum', transId);
        if (!t) return fail(UZUM_ERRORS.TXN_NOT_FOUND);
        const c = await ledger.cancelTxn('uzum', transId, 0, now);
        return okBody({ transId, status: STATUS[c.state], reverseTime: Date.parse(c.cancelledAt!), amount: c.amount });
      }
      case 'status': {
        const t = await ledger.getTxn('uzum', transId);
        if (!t) return fail(UZUM_ERRORS.TXN_NOT_FOUND);
        return okBody({ transId, status: STATUS[t.state], transTime: Date.parse(t.createdAt), amount: t.amount });
      }
    }
  } catch (e) {
    if (isDomainError(e) && e.details.reason === 'BUSY') return fail(UZUM_ERRORS.ALREADY);
    throw e;
  }
}

export function uzumCheckoutUrl(cfg: UzumConfig, paymentId: string, amount: number): string {
  assertSandbox(cfg, 'Uzum');
  return `https://www.uzumbank.uz/open-service?${new URLSearchParams({ serviceId: cfg.serviceId, payment_id: paymentId, amount: String(amount) })}`;
}
