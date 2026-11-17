/**
 * The payment ledger used by the provider protocol handlers (@ustoz/payments). Provider callbacks arrive
 * without a user, so each call resolves the centre from the payment / transaction id through a SECURITY
 * DEFINER lookup and then works inside that centre's RLS scope like everything else.
 */
import { DomainError, uuidv7 } from '@ustoz/core';
import type { Sql } from '../client';
import { completePayment } from './billing';
import { SYSTEM, type Ctx } from './ctx';

export type Provider = 'payme' | 'click' | 'uzum';

export interface Txn {
  id: string;
  paymentId: string;
  provider: Provider;
  providerTxnId: string;
  state: number; // 1 created, 2 performed, -1 cancelled before perform, -2 cancelled after perform
  amount: number;
  createdAt: string;
  performedAt: string | null;
  cancelledAt: string | null;
  reason: number | null;
}

export interface PaymentInfo {
  id: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  method: string;
}

export interface Ledger {
  getPayment(paymentId: string): Promise<PaymentInfo | null>;
  getTxn(provider: Provider, providerTxnId: string): Promise<Txn | null>;
  /** Creates the transaction; at most one live transaction per payment. */
  createTxn(provider: Provider, providerTxnId: string, paymentId: string, amount: number, at: Date): Promise<Txn>;
  performTxn(provider: Provider, providerTxnId: string, at: Date): Promise<Txn>;
  cancelTxn(provider: Provider, providerTxnId: string, reason: number, at: Date): Promise<Txn>;
  listTxns(provider: Provider, from: Date, to: Date): Promise<Txn[]>;
}

const TXN_COLS = 'id, payment_id, provider, provider_txn_id, state, amount, created_at, performed_at, cancelled_at, reason';
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function sqlLedger(ctx: Ctx): Ledger {
  const centreOfPayment = async (paymentId: string) => {
    if (!isUuid(paymentId)) return null;
    const [r] = await ctx.tx(null, SYSTEM, (tx) => tx.query<{ c: string | null }>('select payment_centre($1) as c', [paymentId]));
    return r?.c ?? null;
  };
  const centreOfTxn = async (provider: Provider, id: string) => {
    const [r] = await ctx.tx(null, SYSTEM, (tx) => tx.query<{ c: string | null }>('select txn_centre($1, $2) as c', [provider, id]));
    return r?.c ?? null;
  };
  const inCentre = <T>(centreId: string, fn: (tx: Sql) => Promise<T>) => ctx.tx(centreId, SYSTEM, fn);
  const one = async (tx: Sql, provider: Provider, id: string) => (await tx.query<Txn>(`select ${TXN_COLS} from payment_txns where provider = $1 and provider_txn_id = $2`, [provider, id]))[0] ?? null;

  return {
    async getPayment(paymentId) {
      const c = await centreOfPayment(paymentId);
      if (!c) return null;
      return inCentre(c, async (tx) => (await tx.query<PaymentInfo>('select id, amount, status, method from payments where id = $1', [paymentId]))[0] ?? null);
    },
    async getTxn(provider, id) {
      const c = await centreOfTxn(provider, id);
      return c ? inCentre(c, (tx) => one(tx, provider, id)) : null;
    },
    async createTxn(provider, id, paymentId, amount, at) {
      const c = await centreOfPayment(paymentId);
      if (!c) throw new DomainError('NOT_FOUND', 'Payment not found');
      return inCentre(c, async (tx) => {
        const [live] = await tx.query<{ providerTxnId: string }>(`select provider_txn_id from payment_txns where payment_id = $1 and state in (1, 2)`, [paymentId]);
        if (live && live.providerTxnId !== id) throw new DomainError('CONFLICT', 'Another transaction is in progress', { reason: 'BUSY' });
        await tx.query(
          `insert into payment_txns (centre_id, id, payment_id, provider, provider_txn_id, state, amount, created_at) values ($1,$2,$3,$4,$5,1,$6,$7) on conflict (provider, provider_txn_id) do nothing`,
          [c, uuidv7(at.getTime()), paymentId, provider, id, amount, at.toISOString()],
        );
        return (await one(tx, provider, id))!;
      });
    },
    async performTxn(provider, id, at) {
      const c = await centreOfTxn(provider, id);
      if (!c) throw new DomainError('NOT_FOUND', 'Transaction not found');
      return inCentre(c, async (tx) => {
        const t = (await one(tx, provider, id))!;
        if (t.state === 2) return t;
        if (t.state !== 1) throw new DomainError('INVALID_TRANSITION', 'Transaction is cancelled');
        await tx.query('update payment_txns set state = 2, performed_at = $3 where provider = $1 and provider_txn_id = $2', [provider, id, at.toISOString()]);
        await completePayment(ctx, tx, c, t.paymentId);
        return (await one(tx, provider, id))!;
      });
    },
    async cancelTxn(provider, id, reason, at) {
      const c = await centreOfTxn(provider, id);
      if (!c) throw new DomainError('NOT_FOUND', 'Transaction not found');
      return inCentre(c, async (tx) => {
        const t = (await one(tx, provider, id))!;
        if (t.state < 0) return t;
        const next = t.state === 2 ? -2 : -1;
        await tx.query('update payment_txns set state = $3, cancelled_at = $4, reason = $5 where provider = $1 and provider_txn_id = $2', [provider, id, next, at.toISOString(), reason]);
        await tx.query(`update payments set status = 'cancelled' where id = $1`, [t.paymentId]);
        return (await one(tx, provider, id))!;
      });
    },
    async listTxns(provider, from, to) {
      const centres = await ctx.tx(null, SYSTEM, (tx) => tx.query<{ c: string }>('select job_centres() as c'));
      const out: Txn[] = [];
      for (const { c } of centres)
        out.push(...(await inCentre(c, (tx) => tx.query<Txn>(`select ${TXN_COLS} from payment_txns where provider = $1 and created_at between $2 and $3 order by created_at`, [provider, from.toISOString(), to.toISOString()]))));
      return out;
    },
  };
}
