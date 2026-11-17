import { beforeAll, describe, expect, it } from 'vitest';
import { LocalTestGenerator } from '@ustoz/core';
import { createBackend, migrate, type Backend } from '@ustoz/db';
import { createPgliteDatabase } from '@ustoz/db/pglite';
import { DEMO_CERT_SECRET, PERSONAS, seedDemo } from '@ustoz/seed';
import { backendBotDeps, handleUpdate, type BotDeps } from '../src';

let be: Backend;
let deps: BotDeps;
const now = new Date('2026-11-18T07:00:00Z');

beforeAll(async () => {
  const db = await createPgliteDatabase();
  await migrate(db);
  await seedDemo(db, { now });
  be = createBackend({ db, clock: { now: () => now }, certSecret: DEMO_CERT_SECRET, verifyBase: 'x/', testGenerator: new LocalTestGenerator() });
  deps = backendBotDeps(be, { centreName: 'Ustoz Academy', miniAppUrl: 'https://example.test/app' });
}, 120_000);

const say = (user: (typeof PERSONAS)['parent'], text: string) => handleUpdate(deps, user, { kind: 'text', text });

describe('bot engine', () => {
  it('a stranger is asked for their phone and linked by it', async () => {
    const stranger = { id: 900_001, first_name: 'Lola', language_code: 'uz' };
    const [r1] = await handleUpdate(deps, stranger, { kind: 'start' });
    expect(r1!.text).toContain('telefon raqamingizni');
    expect(r1!.reply![0]![0]!.requestContact).toBe(true);
    expect((await handleUpdate(deps, stranger, { kind: 'contact', phone: '+998931234567', own: false }))[0]!.text).toContain("o'zingizning");
    expect((await handleUpdate(deps, stranger, { kind: 'contact', phone: '+998931234567', own: true }))[0]!.text).toContain('topilmadi');
    // a seeded parent whose Telegram is not linked yet
    const [row] = await be.ctx.db.query<{ phone: string }>("select phone from parents where telegram_id is null order by phone limit 1");
    const [r2] = await handleUpdate(deps, stranger, { kind: 'contact', phone: row!.phone, own: true });
    expect(r2!.text).toContain('tasdiqlandi');
    expect(r2!.reply!.flat().map((b) => b.text)).toContain('Balans va to\'lov');
  });

  it('parent sees both children in schedule, balance and grades', async () => {
    const sched = (await say(PERSONAS.parent, 'Dars jadvali'))[0]!.text;
    expect(sched).toContain('Aziz Karimov');
    expect(sched).toContain('Madina Karimova');
    const bal = (await say(PERSONAS.parent, 'Balans va to\'lov'))[0]!.text;
    expect(bal).toMatch(/Qarz|Qarz yo'q/);
    expect(bal).toContain('Payme');
    const grades = (await say(PERSONAS.parent, 'Baholar'))[0]!.text;
    expect(grades).toContain('O\'rtacha');
  });

  it('language switch changes the menu and is remembered', async () => {
    const [pick] = await say(PERSONAS.parent, 'Til');
    expect(pick!.inline!.flat().map((b) => b.data)).toEqual(['lang:uz', 'lang:ru', 'lang:en']);
    const [ru] = await handleUpdate(deps, PERSONAS.parent, { kind: 'button', data: 'lang:ru' });
    expect(ru!.text).toBe('Язык изменён.');
    expect(ru!.reply!.flat().map((b) => b.text)).toContain('Расписание');
    expect((await say(PERSONAS.parent, 'Расписание'))[0]!.text).toContain('расписание на неделю');
    await handleUpdate(deps, PERSONAS.parent, { kind: 'button', data: 'lang:uz' });
  });

  it('student hands in homework through the bot: text and photo', async () => {
    const [list] = await say(PERSONAS.student, 'Uy vazifalar');
    const btn = list!.inline![0]![0]!;
    expect(btn.data).toMatch(/^hw:/);
    const [ask] = await handleUpdate(deps, PERSONAS.student, { kind: 'button', data: btn.data! });
    expect(ask!.text).toContain('javobingizni yuboring');
    const [done] = await handleUpdate(deps, PERSONAS.student, { kind: 'photo', fileName: 'daftar.jpg', dataUrl: 'data:image/jpeg;base64,AAAA', caption: 'Bajardim' });
    expect(done!.text).toContain('Qabul qilindi');
    const hwId = btn.data!.slice(3);
    const [sub] = await be.ctx.db.query<{ kind: string; body: string }>('select kind, body from submissions where homework_id = $1 and file_name = $2', [hwId, 'daftar.jpg']);
    expect(sub).toEqual({ kind: 'photo', body: 'Bajardim' });
    // resubmitting the same homework as text replaces the answer
    await handleUpdate(deps, PERSONAS.student, { kind: 'button', data: btn.data! });
    expect((await say(PERSONAS.student, 'Mana javobim'))[0]!.text).toContain('Yangilandi');
  });

  it('after a cancel, ordinary text is not taken as homework', async () => {
    const [list] = await say(PERSONAS.student, 'Uy vazifalar');
    await handleUpdate(deps, PERSONAS.student, { kind: 'button', data: list!.inline![0]![0]!.data! });
    await handleUpdate(deps, PERSONAS.student, { kind: 'button', data: 'cancel' });
    expect((await say(PERSONAS.student, 'salom'))[0]!.text).toContain('Tugmalardan');
  });

  it('teacher gets today\'s lessons', async () => {
    const [r] = await say(PERSONAS.teacher, 'Bugungi darslar');
    expect(r!.text).toContain('A2-14');
  });
});
