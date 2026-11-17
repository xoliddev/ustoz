import { beforeAll, describe, expect, it } from 'vitest';
import type { Update } from 'grammy/types';
import { LocalTestGenerator } from '@ustoz/core';
import { createBackend, migrate, type Backend } from '@ustoz/db';
import { createPgliteDatabase } from '@ustoz/db/pglite';
import { DEMO_CERT_SECRET, PERSONAS, seedDemo } from '@ustoz/seed';
import { createBot, deliverOutbox } from '../src';

const now = new Date('2026-11-18T07:00:00Z');
let be: Backend;
const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
const botInfo = { id: 1, is_bot: true as const, first_name: 'Ustoz', username: 'ustoz_demo_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as never;

function fakeBot() {
  const bot = createBot('1:TEST', be, { centreName: 'Ustoz Academy', miniAppUrl: 'https://example.test/app', botInfo, log: () => {} });
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: (method === 'sendMessage' ? { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } : true) as never };
  });
  return bot;
}

let uid = 1000;
const msg = (from: (typeof PERSONAS)['parent'], extra: Record<string, unknown>): Update =>
  ({ update_id: ++uid, message: { message_id: uid, date: 0, chat: { id: from.id, type: 'private', first_name: from.first_name }, from: { id: from.id, is_bot: false, first_name: from.first_name, language_code: 'uz' }, ...extra } }) as Update;

beforeAll(async () => {
  const db = await createPgliteDatabase();
  await migrate(db);
  await seedDemo(db, { now });
  be = createBackend({ db, clock: { now: () => now }, certSecret: DEMO_CERT_SECRET, verifyBase: 'x/', testGenerator: new LocalTestGenerator() });
}, 120_000);

describe('grammY adapter', () => {
  it('answers /start with the main menu keyboard (no slash commands needed afterwards)', async () => {
    const bot = fakeBot();
    calls.length = 0;
    await bot.handleUpdate(msg(PERSONAS.parent, { text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] }));
    const sent = calls.find((c) => c.method === 'sendMessage')!;
    expect(sent.payload.parse_mode).toBe('HTML');
    const kb = (sent.payload.reply_markup as { keyboard: Array<Array<{ text: string }>> }).keyboard.flat().map((b) => b.text);
    expect(kb).toEqual(expect.arrayContaining(['Dars jadvali', 'Balans va to\'lov', 'Uy vazifalar', 'Baholar']));
  });

  it('processes each update id once (Telegram webhook retries)', async () => {
    const bot = fakeBot();
    calls.length = 0;
    const u = msg(PERSONAS.parent, { text: 'Baholar' });
    await bot.handleUpdate(u);
    await bot.handleUpdate(u);
    expect(calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1);
  });

  it('ignores group chats', async () => {
    const bot = fakeBot();
    calls.length = 0;
    const u = msg(PERSONAS.parent, { text: 'Baholar' }) as Update & { message: { chat: { type: string } } };
    u.message.chat.type = 'group';
    await bot.handleUpdate(u);
    expect(calls).toHaveLength(0);
  });

  it('a callback button is acknowledged and handled', async () => {
    const bot = fakeBot();
    calls.length = 0;
    await bot.handleUpdate({ update_id: ++uid, callback_query: { id: 'cb1', chat_instance: 'x', data: 'lang:en', from: { id: PERSONAS.parent.id, is_bot: false, first_name: 'Shoira' }, message: { message_id: 1, date: 0, chat: { id: PERSONAS.parent.id, type: 'private', first_name: 'Shoira' } } } } as Update);
    expect(calls.map((c) => c.method)).toEqual(['answerCallbackQuery', 'sendMessage']);
    expect(calls[1]!.payload.text).toBe('Language changed.');
    await bot.handleUpdate({ update_id: ++uid, callback_query: { id: 'cb2', chat_instance: 'x', data: 'lang:uz', from: { id: PERSONAS.parent.id, is_bot: false, first_name: 'Shoira' }, message: { message_id: 1, date: 0, chat: { id: PERSONAS.parent.id, type: 'private', first_name: 'Shoira' } } } } as Update);
  });

  it('delivers the outbox once, rendered in the recipient language', async () => {
    const bot = fakeBot();
    const admin = (await be.signIn(PERSONAS.admin, { role: 'admin' })).actor;
    await be.methods['billing.remind'](admin, {});
    calls.length = 0;
    let total = 0;
    for (let k = 0; k < 20; k++) {
      const r = await deliverOutbox(bot.api, be, 50);
      total += r.sent;
      if (!r.sent && !r.failed) break;
    }
    expect(total).toBeGreaterThan(0);
    expect(calls.every((c) => c.method === 'sendMessage' && /Eslatma|Напоминание|Reminder|qabul|получена|received|vazifa|test|Tabriklaymiz|darsga/i.test(String(c.payload.text)))).toBe(true);
    expect((await deliverOutbox(bot.api, be)).sent).toBe(0);
  });
});
