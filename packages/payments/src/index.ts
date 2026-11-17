/**
 * @ustoz/payments — Payme, Click and Uzum adapters (sandbox only) plus a sandbox "provider player" that
 * sends the provider's real callback sequence, correctly authenticated/signed, through those adapters.
 * The demo uses the player to complete a payment end-to-end with no network and no real money.
 */
import { DomainError, fnv1a } from '@ustoz/core';
import type { PaymentsPort } from '@ustoz/db';
import { clickCheckoutUrl, clickForm, handleClick } from './click';
import { handlePayme, paymeAuthHeader, paymeCheckoutUrl } from './payme';
import { assertSandbox, type Ledger, type Provider, type ProtocolStep, type ProvidersConfig } from './types';
import { handleUzum, uzumAuthHeader, uzumCheckoutUrl, type UzumOp } from './uzum';

export * from './types';
export * from './payme';
export * from './click';
export * from './uzum';

/** Sandbox credentials for the in-browser demo and tests. Not real merchant keys. */
export const SANDBOX_CONFIG: Required<ProvidersConfig> = {
  payme: { mode: 'sandbox', merchantId: 'sandbox-merchant', key: 'sandbox-payme-key' },
  click: { mode: 'sandbox', serviceId: '00000', merchantId: '00000', secretKey: 'sandbox-click-secret' },
  uzum: { mode: 'sandbox', serviceId: '000000', login: 'sandbox', password: 'sandbox-uzum-password' },
};

export function createPaymentsPort(cfg: ProvidersConfig): PaymentsPort {
  return {
    checkout(provider, p) {
      if (provider === 'payme') return { url: paymeCheckoutUrl(cfg.payme!, p.paymentId, p.amount), params: { amount: p.amount } };
      if (provider === 'click') return { url: clickCheckoutUrl(cfg.click!, p.paymentId, p.amount), params: { amount: p.amount } };
      return { url: uzumCheckoutUrl(cfg.uzum!, p.paymentId, p.amount), params: { amount: p.amount } };
    },
  };
}

/**
 * Plays the provider's side of a successful payment in sandbox: the exact callback sequence each provider
 * sends, through the real handlers. Returns the protocol log; throws if any step is refused.
 */
export async function playSandboxPayment(ledger: Ledger, cfg: ProvidersConfig, provider: Provider, paymentId: string, amount: number, now: Date): Promise<ProtocolStep[]> {
  const steps: ProtocolStep[] = [];
  const txn = `sbx${fnv1a(`${paymentId}:${now.getTime()}`).toString(16)}`;
  const record = (request: unknown, response: Record<string, unknown>, ok: boolean) => {
    steps.push({ provider, request, response, ok });
    if (!ok) throw new DomainError('PAYMENT_ERROR', `${provider} sandbox step failed`, { response });
  };
  if (provider === 'payme') {
    const c = cfg.payme!;
    assertSandbox(c, 'Payme');
    const auth = paymeAuthHeader(c.key);
    const calls: Array<[string, Record<string, unknown>]> = [
      ['CheckPerformTransaction', { amount, account: { payment_id: paymentId } }],
      ['CreateTransaction', { id: txn, time: now.getTime(), amount, account: { payment_id: paymentId } }],
      ['PerformTransaction', { id: txn }],
    ];
    for (const [k, [method, params]] of calls.entries()) {
      const body = { jsonrpc: '2.0', id: k + 1, method, params };
      const res = await handlePayme(ledger, c, { authorization: auth, body }, now);
      record(body, res, !('error' in res));
    }
  } else if (provider === 'click') {
    const c = cfg.click!;
    assertSandbox(c, 'Click');
    const signTime = now.toISOString().replace('T', ' ').slice(0, 19);
    const prep = clickForm(c, { clickTransId: txn.replace(/\D/g, '').slice(0, 12) || '1', paymentId, amount, action: '0', signTime });
    const r1 = await handleClick(ledger, c, prep, now);
    record(prep, r1, r1.error === 0);
    const comp = clickForm(c, { clickTransId: prep.click_trans_id!, paymentId, amount, action: '1', signTime, prepareId: String(r1.merchant_prepare_id) });
    const r2 = await handleClick(ledger, c, comp, now);
    record(comp, r2, r2.error === 0);
  } else {
    const c = cfg.uzum!;
    assertSandbox(c, 'Uzum');
    const auth = uzumAuthHeader(c);
    const ops: UzumOp[] = ['check', 'create', 'confirm'];
    for (const op of ops) {
      const body = { serviceId: c.serviceId, timestamp: now.getTime(), transId: txn, params: { payment_id: paymentId }, amount };
      const res = await handleUzum(ledger, c, op, { authorization: auth, body }, now);
      record({ op, ...body }, res.body, res.status === 200);
    }
  }
  return steps;
}
