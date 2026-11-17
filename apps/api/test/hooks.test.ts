import { describe, expect, it } from 'vitest';
import { createBot } from '@ustoz/bot';
import { createBackend } from '@ustoz/db';
import { loadEnv } from '../src';
import { ADAPTERS, makeApi, WEBHOOK_SECRET } from './helpers';

describe('Telegram webhook', () => {
  it('rejects requests without the secret token', async () => {
    const holder: { be?: ReturnType<typeof createBackend> } = {};
    const sent: string[] = [];
    const lazy = new Proxy({}, { get: (_t, k) => (holder.be as never)[k] }) as ReturnType<typeof createBackend>;
    const bot = createBot('1:TEST', lazy, { centreName: 'Ustoz', miniAppUrl: 'https://x', botInfo: { id: 1, is_bot: true, first_name: 'U', username: 'u_bot' } as never, log: () => {} });
    bot.api.config.use(async (_p, method) => {
      sent.push(method);
      return { ok: true, result: true as never };
    });
    const api = await makeApi(ADAPTERS[0]!.make, { bot });
    holder.be = api.backend;
    const update = { update_id: 1, message: { message_id: 1, date: 0, chat: { id: 5, type: 'private', first_name: 'A' }, from: { id: 5, is_bot: false, first_name: 'A' }, text: 'salom' } };
    expect((await api.app.inject({ method: 'POST', url: '/hooks/telegram', payload: update })).statusCode).toBe(401);
    expect((await api.app.inject({ method: 'POST', url: '/hooks/telegram', payload: update, headers: { 'x-telegram-bot-api-secret-token': 'wrong_secret_value_x' } })).statusCode).toBe(401);
    const ok = await api.app.inject({ method: 'POST', url: '/hooks/telegram', payload: update, headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET } });
    expect(ok.statusCode).toBe(200);
    expect(sent).toContain('sendMessage');
    await api.close();
  }, 120_000);
});

describe('environment', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(32), CERT_SECRET: 'y'.repeat(32) };
  it('accepts a minimal config and refuses weak or live settings', () => {
    expect(loadEnv(base).PAYMENTS_MODE).toBe('sandbox');
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, PAYMENTS_MODE: 'live' })).toThrow(/sandbox/);
    expect(() => loadEnv({ ...base, BOT_TOKEN: 'nope' })).toThrow(/BOT_TOKEN/);
    expect(loadEnv({ ...base, CORS_ORIGINS: 'https://a.test, https://b.test' }).CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });
});
