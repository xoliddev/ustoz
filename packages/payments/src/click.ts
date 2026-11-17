/**
 * Click SHOP API: two form-encoded callbacks, Prepare (action=0) and Complete (action=1).
 *   sign_string = md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
 *                     [+ merchant_prepare_id on Complete] + amount + action + sign_time)
 * merchant_trans_id is our pending payment id; amount is so'm with two decimals.
 */
import { md5Hex, timingSafeEqual } from '@ustoz/core';
import { assertSandbox, somStringToTiyin, tiyinToSomString, type ClickConfig, type Ledger } from './types';

export const CLICK_ERRORS = { OK: 0, SIGN: -1, AMOUNT: -2, ACTION: -3, ALREADY_PAID: -4, NOT_FOUND: -5, TXN_NOT_FOUND: -6, BAD_REQUEST: -8, CANCELLED: -9 } as const;

export type ClickForm = Record<string, string>;

export function clickSign(cfg: ClickConfig, f: ClickForm): string {
  const prepare = f.action === '1' ? (f.merchant_prepare_id ?? '') : '';
  return md5Hex(`${f.click_trans_id}${f.service_id}${cfg.secretKey}${f.merchant_trans_id}${prepare}${f.amount}${f.action}${f.sign_time}`);
}

export async function handleClick(ledger: Ledger, cfg: ClickConfig, f: ClickForm, now: Date): Promise<Record<string, unknown>> {
  assertSandbox(cfg, 'Click');
  const base = { click_trans_id: f.click_trans_id ?? null, merchant_trans_id: f.merchant_trans_id ?? null };
  const fail = (error: number, note: string) => ({ ...base, error, error_note: note });
  for (const k of ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'sign_time', 'sign_string'])
    if (typeof f[k] !== 'string' || !f[k]) return fail(CLICK_ERRORS.BAD_REQUEST, `Missing ${k}`);
  if (f.service_id !== cfg.serviceId) return fail(CLICK_ERRORS.BAD_REQUEST, 'Unknown service');
  if (!timingSafeEqual(clickSign(cfg, f), String(f.sign_string).toLowerCase())) return fail(CLICK_ERRORS.SIGN, 'SIGN CHECK FAILED');
  if (f.action !== '0' && f.action !== '1') return fail(CLICK_ERRORS.ACTION, 'Action not found');
  const amount = somStringToTiyin(f.amount!);
  const pay = await ledger.getPayment(f.merchant_trans_id!);
  if (!pay) return fail(CLICK_ERRORS.NOT_FOUND, 'Payment not found');
  if (amount === null || amount !== pay.amount) return fail(CLICK_ERRORS.AMOUNT, 'Incorrect parameter amount');
  const txnId = f.click_trans_id!;

  if (f.action === '0') {
    if (pay.status === 'paid') return fail(CLICK_ERRORS.ALREADY_PAID, 'Already paid');
    if (pay.status === 'cancelled') return fail(CLICK_ERRORS.CANCELLED, 'Transaction cancelled');
    const t = await ledger.createTxn('click', txnId, pay.id, amount, now);
    return { ...base, merchant_prepare_id: t.id, error: 0, error_note: 'Success' };
  }

  const t = await ledger.getTxn('click', txnId);
  if (!t || t.id !== f.merchant_prepare_id) return fail(CLICK_ERRORS.TXN_NOT_FOUND, 'Transaction does not exist');
  // Click reports its own failure in `error` (< 0): cancel on our side
  if (Number(f.error ?? 0) < 0) {
    const c = await ledger.cancelTxn('click', txnId, Number(f.error), now);
    return { ...base, merchant_confirm_id: c.id, error: CLICK_ERRORS.CANCELLED, error_note: 'Transaction cancelled' };
  }
  if (t.state < 0) return fail(CLICK_ERRORS.CANCELLED, 'Transaction cancelled');
  if (t.state === 2) return { ...base, merchant_confirm_id: t.id, error: CLICK_ERRORS.ALREADY_PAID, error_note: 'Already paid' };
  const done = await ledger.performTxn('click', txnId, now);
  return { ...base, merchant_confirm_id: done.id, error: 0, error_note: 'Success' };
}

/** Builds a signed callback form (the demo uses it to play Click's side in sandbox). */
export function clickForm(cfg: ClickConfig, p: { clickTransId: string; paymentId: string; amount: number; action: '0' | '1'; signTime: string; prepareId?: string; error?: number }): ClickForm {
  const f: ClickForm = {
    click_trans_id: p.clickTransId, service_id: cfg.serviceId, click_paydoc_id: `${p.clickTransId}0`, merchant_trans_id: p.paymentId,
    amount: tiyinToSomString(p.amount), action: p.action, error: String(p.error ?? 0), error_note: p.error ? 'Error' : 'Success', sign_time: p.signTime,
  };
  if (p.prepareId) f.merchant_prepare_id = p.prepareId;
  f.sign_string = clickSign(cfg, f);
  return f;
}

export function clickCheckoutUrl(cfg: ClickConfig, paymentId: string, amount: number): string {
  assertSandbox(cfg, 'Click');
  const q = new URLSearchParams({ service_id: cfg.serviceId, merchant_id: cfg.merchantId, amount: tiyinToSomString(amount), transaction_param: paymentId });
  return `https://my.click.uz/services/pay?${q}`;
}
