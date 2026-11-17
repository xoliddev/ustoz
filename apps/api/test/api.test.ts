import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInitData } from '@ustoz/core';
import { clickForm, paymeAuthHeader, SANDBOX_CONFIG, uzumAuthHeader } from '@ustoz/payments';
import { PERSONAS } from '@ustoz/seed';
import { ADAPTERS, BOT_TOKEN, makeApi } from './helpers';

describe.each(ADAPTERS)('HTTP API ($name)', ({ make }) => {
  let api: Awaited<ReturnType<typeof makeApi>>;
  const tokens: Record<string, string> = {};
  beforeAll(async () => {
    api = await makeApi(make, { limits: { auth: 100 } });
    for (const r of ['director', 'admin', 'teacher', 'student', 'parent'] as const) tokens[r] = (await api.login(PERSONAS[r], r)).token;
  }, 180_000);
  afterAll(() => api.close());

  it('health and security headers', async () => {
    const r = await api.app.inject({ method: 'GET', url: '/healthz' });
    expect(r.json()).toEqual({ ok: true });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('login needs a valid, fresh, untampered initData', async () => {
    const now = new Date('2026-11-18T07:00:00Z');
    const good = await signInitData({ user: PERSONAS.parent, authDate: now }, BOT_TOKEN);
    expect((await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: good } })).statusCode).toBe(200);
    const tampered = good.replace('Shoira', 'Hacker');
    expect((await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: tampered } })).json().error.code).toBe('UNAUTHENTICATED');
    const stale = await signInitData({ user: PERSONAS.parent, authDate: new Date(now.getTime() - 2 * 3600_000) }, BOT_TOKEN);
    const r = await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: stale } });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.message).toMatch(/expired/);
    const otherBot = await signInitData({ user: PERSONAS.parent, authDate: now }, '999:another-bot-token-xxxxxxxxxxxxxxxxxxxxxxxx');
    expect((await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: otherBot } })).statusCode).toBe(401);
    // claiming a role you do not have
    const asDirector = await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: good, role: 'director' } });
    expect(asDirector.statusCode).toBe(403);
  });

  it('every method needs a token, a permission and valid input', async () => {
    expect((await api.call(null, 'me')).statusCode).toBe(401);
    expect((await api.call('not-a-real-token-at-all.xxx.yyy', 'me')).statusCode).toBe(401);
    expect((await api.call(tokens.parent!, 'billing.debtors')).statusCode).toBe(403);
    expect((await api.call(tokens.teacher!, 'dashboard.summary')).statusCode).toBe(403);
    expect((await api.call(tokens.admin!, 'payroll.report', { month: '2026-11' })).statusCode).toBe(403);
    const bad = await api.call(tokens.admin!, 'payments.record', { studentId: 'x', amount: -5, method: 'cash' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatchObject({ code: 'VALIDATION', details: { field: 'studentId' } });
    expect((await api.call(tokens.admin!, 'nope.nope')).statusCode).toBe(404);
    expect((await api.call(tokens.director!, 'dashboard.summary')).statusCode).toBe(200);
  });

  it('a role switch only works for roles the user really has', async () => {
    const me = (await api.call(tokens.director!, 'me')).json();
    const r = await api.app.inject({ method: 'POST', url: '/v1/auth/switch', payload: { centreId: me.centre.id, role: 'teacher' }, headers: { authorization: `Bearer ${tokens.director}` } });
    expect(r.statusCode).toBe(403);
  });

  it('the public certificate check works without a token and rejects forgeries', async () => {
    const [c] = await api.db.query<{ code: string }>('select code from certificates limit 1');
    const ok = await api.call(null, 'certificates.verify', { code: c!.code });
    expect(ok.json()).toMatchObject({ valid: true, certificate: { code: c!.code } });
    await api.db.query(`update certificates set level = 'C2' where code = $1`, [c!.code]);
    expect((await api.call(null, 'certificates.verify', { code: c!.code })).json()).toEqual({ valid: false });
    expect((await api.call(null, 'certificates.verify', { code: 'ZZZZZZZZ' })).json()).toEqual({ valid: false });
  });

  it('parent pays online through the Payme webhook (sandbox)', async () => {
    const co = (await api.call(tokens.parent!, 'payments.checkout', { amount: 15_000_000, provider: 'payme' })).json();
    expect(co.url).toContain('checkout.test.paycom.uz');
    const rpc = (method: string, params: unknown, auth = paymeAuthHeader(SANDBOX_CONFIG.payme.key)) =>
      api.app.inject({ method: 'POST', url: '/hooks/payme', headers: { authorization: auth }, payload: { jsonrpc: '2.0', id: 7, method, params } });
    expect((await rpc('CheckPerformTransaction', { amount: 15_000_000, account: { payment_id: co.paymentId } }, 'Basic bad')).json().error.code).toBe(-32504);
    expect((await rpc('CreateTransaction', { id: 'http-1', time: Date.now(), amount: 15_000_000, account: { payment_id: co.paymentId } })).json().result.state).toBe(1);
    expect((await rpc('PerformTransaction', { id: 'http-1' })).json().result.state).toBe(2);
    expect((await api.call(tokens.parent!, 'payments.status', { paymentId: co.paymentId })).json().status).toBe('paid');
  });

  it('Click form webhook checks the signature', async () => {
    const co = (await api.call(tokens.parent!, 'payments.checkout', { amount: 2_000_000, provider: 'click' })).json();
    const f = clickForm(SANDBOX_CONFIG.click, { clickTransId: '5001', paymentId: co.paymentId, amount: 2_000_000, action: '0', signTime: '2026-11-18 12:00:00' });
    const post = (form: Record<string, string>) => api.app.inject({ method: 'POST', url: '/hooks/click/prepare', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(form).toString() });
    expect((await post({ ...f, sign_string: '0'.repeat(32) })).json().error).toBe(-1);
    expect((await post(f)).json().error).toBe(0);
  });

  it('Uzum webhook needs Basic auth', async () => {
    const co = (await api.call(tokens.parent!, 'payments.checkout', { amount: 3_000_000, provider: 'uzum' })).json();
    const body = { serviceId: SANDBOX_CONFIG.uzum.serviceId, timestamp: Date.now(), transId: 'uz-http', params: { payment_id: co.paymentId }, amount: 3_000_000 };
    expect((await api.app.inject({ method: 'POST', url: '/hooks/uzum/check', payload: body })).statusCode).toBe(401);
    expect((await api.app.inject({ method: 'POST', url: '/hooks/uzum/check', payload: body, headers: { authorization: uzumAuthHeader(SANDBOX_CONFIG.uzum) } })).json().status).toBe('OK');
  });

  it('CORS allows only the configured origin', async () => {
    const ok = await api.app.inject({ method: 'OPTIONS', url: '/v1/me', headers: { origin: 'https://app.example.test', 'access-control-request-method': 'POST' } });
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.example.test');
    const evil = await api.app.inject({ method: 'OPTIONS', url: '/v1/me', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limits', () => {
  it('login is limited per IP and returns retry-after', async () => {
    const api = await makeApi(ADAPTERS[0]!.make, { limits: { auth: 3 } });
    const codes: number[] = [];
    for (let k = 0; k < 5; k++) codes.push((await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: 'x' } })).statusCode);
    expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
    const r = await api.app.inject({ method: 'POST', url: '/v1/auth/telegram', payload: { initData: 'x' } });
    expect(r.statusCode).toBe(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    await api.close();
  }, 120_000);
});
