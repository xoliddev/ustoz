import { beforeAll, describe, expect, it } from 'vitest';
import { LocalTestGenerator, type Role } from '@ustoz/core';
import { createBackend, migrate, type Actor } from '@ustoz/db';
import { createPgliteDatabase } from '@ustoz/db/pglite';
import { DEMO_CERT_SECRET, PERSONAS, seedDemo } from '@ustoz/seed';
import {
  clickForm, createPaymentsPort, handleClick, handlePayme, handleUzum, paymeAuthHeader, playSandboxPayment, PAYME_ERRORS, SANDBOX_CONFIG, somStringToTiyin, uzumAuthHeader,
} from '../src';

const now = new Date('2026-11-18T07:00:00Z');
let be: ReturnType<typeof createBackend>;
let as: Record<Role, Actor>;

beforeAll(async () => {
  const db = await createPgliteDatabase();
  await migrate(db);
  await seedDemo(db, { now });
  be = createBackend({ db, clock: { now: () => now }, certSecret: DEMO_CERT_SECRET, verifyBase: 'x/', testGenerator: new LocalTestGenerator(), payments: createPaymentsPort(SANDBOX_CONFIG) });
  as = {} as Record<Role, Actor>;
  for (const r of ['parent', 'admin'] as Role[]) as[r] = (await be.signIn(PERSONAS[r], { role: r })).actor;
}, 120_000);

const pending = async (amount = 25_000_000, provider: 'payme' | 'click' | 'uzum' = 'payme') => be.methods['payments.checkout'](as.parent, { amount, provider });
const rpc = (method: string, params: Record<string, unknown>, key = SANDBOX_CONFIG.payme.key) =>
  handlePayme(be.ledger, SANDBOX_CONFIG.payme, { authorization: paymeAuthHeader(key), body: { jsonrpc: '2.0', id: 1, method, params } }, now);

describe('Payme', () => {
  it('rejects bad auth, unknown payments and wrong amounts', async () => {
    const p = await pending();
    expect(await rpc('CheckPerformTransaction', { amount: 25_000_000, account: { payment_id: p.paymentId } }, 'wrong')).toMatchObject({ error: { code: PAYME_ERRORS.AUTH } });
    expect(await rpc('CheckPerformTransaction', { amount: 25_000_000, account: { payment_id: '00000000-0000-4000-a000-000000000000' } })).toMatchObject({ error: { code: PAYME_ERRORS.ACCOUNT } });
    expect(await rpc('CheckPerformTransaction', { amount: 25_000_001, account: { payment_id: p.paymentId } })).toMatchObject({ error: { code: PAYME_ERRORS.INVALID_AMOUNT } });
    expect(await rpc('Nope', {})).toMatchObject({ error: { code: PAYME_ERRORS.METHOD_NOT_FOUND } });
  });

  it('create → perform pays exactly once (idempotent), cancel after perform reverses', async () => {
    const p = await pending(31_250_050);
    const acc = { payment_id: p.paymentId };
    const c1 = await rpc('CreateTransaction', { id: 'pm-1', time: now.getTime(), amount: 31_250_050, account: acc });
    const c2 = await rpc('CreateTransaction', { id: 'pm-1', time: now.getTime(), amount: 31_250_050, account: acc });
    expect(c1).toMatchObject({ result: { state: 1 } });
    expect((c2 as { result: unknown }).result).toEqual((c1 as { result: unknown }).result);
    // a second transaction for the same payment is refused while the first is alive
    expect(await rpc('CreateTransaction', { id: 'pm-2', time: now.getTime(), amount: 31_250_050, account: acc })).toMatchObject({ error: { code: PAYME_ERRORS.BUSY } });
    expect(await rpc('PerformTransaction', { id: 'pm-1' })).toMatchObject({ result: { state: 2 } });
    expect(await rpc('PerformTransaction', { id: 'pm-1' })).toMatchObject({ result: { state: 2 } });
    expect((await be.methods['payments.status'](as.parent, { paymentId: p.paymentId })).status).toBe('paid');
    expect(await rpc('CheckTransaction', { id: 'pm-1' })).toMatchObject({ result: { state: 2 } });
    expect(await rpc('CancelTransaction', { id: 'pm-1', reason: 5 })).toMatchObject({ result: { state: -2 } });
    expect((await be.methods['payments.status'](as.parent, { paymentId: p.paymentId })).status).toBe('cancelled');
    const st = await rpc('GetStatement', { from: now.getTime() - 1000, to: now.getTime() + 1000 });
    expect((st as { result: { transactions: unknown[] } }).result.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('expired transactions are cancelled instead of performed', async () => {
    const p = await pending(10_000_000);
    await rpc('CreateTransaction', { id: 'pm-old', time: now.getTime() - 13 * 3600_000, amount: 10_000_000, account: { payment_id: p.paymentId } });
    expect(await rpc('PerformTransaction', { id: 'pm-old' })).toMatchObject({ error: { code: PAYME_ERRORS.CANT_PERFORM } });
  });
});

describe('Click', () => {
  it('checks the md5 signature and the amount, then prepare → complete', async () => {
    const p = await pending(12_345_600, 'click');
    const cfg = SANDBOX_CONFIG.click;
    const f = clickForm(cfg, { clickTransId: '777001', paymentId: p.paymentId, amount: 12_345_600, action: '0', signTime: '2026-11-18 12:00:00' });
    expect(await handleClick(be.ledger, cfg, { ...f, sign_string: 'deadbeef'.repeat(4) }, now)).toMatchObject({ error: -1 });
    expect(await handleClick(be.ledger, cfg, clickForm(cfg, { clickTransId: '777001', paymentId: p.paymentId, amount: 12_345_500, action: '0', signTime: 'x' }), now)).toMatchObject({ error: -2 });
    const prep = await handleClick(be.ledger, cfg, f, now);
    expect(prep.error).toBe(0);
    const comp = clickForm(cfg, { clickTransId: '777001', paymentId: p.paymentId, amount: 12_345_600, action: '1', signTime: 'y', prepareId: String(prep.merchant_prepare_id) });
    expect(await handleClick(be.ledger, cfg, comp, now)).toMatchObject({ error: 0 });
    expect(await handleClick(be.ledger, cfg, comp, now)).toMatchObject({ error: -4 });
    expect(somStringToTiyin('123456.00')).toBe(12_345_600);
    expect(somStringToTiyin('1.5')).toBe(150);
    expect(somStringToTiyin('1e5')).toBeNull();
  });
});

describe('Uzum', () => {
  it('requires Basic auth; check → create → confirm; reverse', async () => {
    const p = await pending(9_900_000, 'uzum');
    const cfg = SANDBOX_CONFIG.uzum;
    const body = { serviceId: cfg.serviceId, timestamp: now.getTime(), transId: 'uz-1', params: { payment_id: p.paymentId }, amount: 9_900_000 };
    expect((await handleUzum(be.ledger, cfg, 'check', { authorization: 'Basic eDp5', body }, now)).status).toBe(401);
    const auth = uzumAuthHeader(cfg);
    expect((await handleUzum(be.ledger, cfg, 'check', { authorization: auth, body }, now)).body.status).toBe('OK');
    expect((await handleUzum(be.ledger, cfg, 'create', { authorization: auth, body: { ...body, amount: 1 } }, now)).body.errorCode).toBe('10011');
    expect((await handleUzum(be.ledger, cfg, 'create', { authorization: auth, body }, now)).body.status).toBe('CREATED');
    expect((await handleUzum(be.ledger, cfg, 'confirm', { authorization: auth, body }, now)).body.status).toBe('CONFIRMED');
    expect((await handleUzum(be.ledger, cfg, 'reverse', { authorization: auth, body }, now)).body.status).toBe('REVERSED');
  });
});

describe('sandbox player and mode guard', () => {
  it.each(['payme', 'click', 'uzum'] as const)('%s: a parent pays online end-to-end', async (provider) => {
    const before = await be.methods['billing.statement'](as.parent, {});
    const p = await pending(5_000_000, provider);
    const steps = await playSandboxPayment(be.ledger, SANDBOX_CONFIG, provider, p.paymentId, 5_000_000, now);
    expect(steps.every((s) => s.ok)).toBe(true);
    const after = await be.methods['billing.statement'](as.parent, {});
    // balance (credit − debt) moves by exactly the paid amount, to the tiyin
    expect(after.credit - after.debt - (before.credit - before.debt)).toBe(5_000_000);
  });

  it('refuses any non-sandbox configuration', async () => {
    const live = { ...SANDBOX_CONFIG.payme, mode: 'live' as unknown as 'sandbox' };
    await expect(handlePayme(be.ledger, live, { body: {} }, now)).rejects.toThrow(/sandbox/);
  });
});
