/**
 * The bot's conversation engine, independent of Telegram plumbing: (user, input) → replies.
 * grammY (apps/bot) maps real updates onto it; the web demo's simulated chat calls the very same function,
 * so what a visitor sees in the demo chat is exactly what the bot would send.
 * Buttons only — no slash commands to remember (except Telegram's mandatory /start).
 */
import { formatMoney, isDomainError, normalizePhone, type Role, type TelegramUser } from '@ustoz/core';
import type { Actor, BotState, Membership, MethodInput, MethodName, MethodOutput } from '@ustoz/db';
import { BOT, bt, esc, type Locale } from '@ustoz/i18n';
import { gradesText, homeworkText, scheduleText, todayText } from './views';

export type BotInput =
  | { kind: 'start' }
  | { kind: 'text'; text: string }
  | { kind: 'button'; data: string }
  | { kind: 'contact'; phone: string; own: boolean }
  | { kind: 'photo'; fileName: string; dataUrl?: string; caption?: string }
  | { kind: 'document'; fileName: string; dataUrl?: string; caption?: string };

export interface Button {
  text: string;
  data?: string;
  requestContact?: boolean;
  webApp?: string;
}

export interface BotReply {
  text: string;
  reply?: Button[][];
  inline?: Button[][];
}

export interface BotDeps {
  centreName: string;
  miniAppUrl: string;
  identify(user: TelegramUser): Promise<{ userId: string; memberships: Membership[]; actorFor(role: Role, centreId: string): Promise<Actor> }>;
  claim(userId: string, telegramId: number, phone: string): Promise<number>;
  call<K extends MethodName>(actor: Actor, name: K, input: MethodInput<K>): Promise<MethodOutput<K>>;
}

const PREFERRED: Role[] = ['student', 'parent', 'teacher', 'admin', 'director'];
const toLocale = (v?: string | null): Locale => (v === 'ru' || v === 'en' ? v : 'uz');

/** Which menu action a typed label means, in any language. */
function actionOf(text: string): string | null {
  const t = text.trim().toLowerCase();
  for (const key of ['btn.schedule', 'btn.balance', 'btn.homework', 'btn.grades', 'btn.language', 'btn.today', 'btn.back', 'btn.cancel'])
    if (BOT[key]!.some((s) => s.toLowerCase() === t)) return key;
  return null;
}

export function menu(l: Locale, role: Role, miniAppUrl: string): Button[][] {
  const app = { text: bt(l, 'btn.app'), webApp: miniAppUrl };
  if (role === 'student' || role === 'parent')
    return [[{ text: bt(l, 'btn.schedule') }, { text: bt(l, 'btn.balance') }], [{ text: bt(l, 'btn.homework') }, { text: bt(l, 'btn.grades') }], [app], [{ text: bt(l, 'btn.language') }]];
  return [[{ text: bt(l, 'btn.today') }], [app], [{ text: bt(l, 'btn.language') }]];
}

export async function handleUpdate(deps: BotDeps, user: TelegramUser, input: BotInput): Promise<BotReply[]> {
  const who = await deps.identify(user);
  const m = PREFERRED.map((r) => who.memberships.find((x) => x.role === r)).find(Boolean);
  let l = toLocale(user.language_code);

  // ── not linked yet: ask for the phone number (Telegram's contact button proves it is theirs) ──
  if (!m) {
    if (input.kind === 'contact') {
      if (!input.own) return [{ text: bt(l, 'contact_not_own') }];
      const phone = normalizePhone(input.phone);
      const n = phone ? await deps.claim(who.userId, user.id, phone) : 0;
      if (!n) return [{ text: bt(l, 'not_found') }];
      const again = await deps.identify(user);
      const m2 = PREFERRED.map((r) => again.memberships.find((x) => x.role === r)).find(Boolean)!;
      return [{ text: `${bt(l, 'linked')}\n\n${bt(l, 'welcome', { name: esc(user.first_name) })}`, reply: menu(l, m2.role, deps.miniAppUrl) }];
    }
    return [{ text: bt(l, 'welcome_new', { centre: esc(deps.centreName) }), reply: [[{ text: bt(l, 'btn.share_phone'), requestContact: true }]] }];
  }

  const actor = await who.actorFor(m.role, m.centreId);
  const state: BotState = await deps.call(actor, 'bot.state', {});
  l = state.locale ?? l;
  const save = (s: BotState) => deps.call(actor, 'bot.saveState', { state: s });
  const home = (text: string): BotReply => ({ text, reply: menu(l, m.role, deps.miniAppUrl) });

  try {
    // ── an answer to the homework we are waiting for ──
    if (state.awaitingHomework && (input.kind === 'photo' || input.kind === 'document' || (input.kind === 'text' && !actionOf(input.text)))) {
      const hw = state.awaitingHomework;
      const sub: MethodInput<'homework.submit'> =
        input.kind === 'text'
          ? { homeworkId: hw.id, kind: 'text', body: input.text.slice(0, 4000) }
          : { homeworkId: hw.id, kind: input.kind === 'photo' ? 'photo' : 'file', body: input.caption ?? '', fileName: input.fileName, fileData: input.dataUrl ?? `telegram:${input.fileName}` };
      const r = await deps.call(actor, 'homework.submit', sub);
      await save({ ...state, awaitingHomework: null });
      return [home(bt(l, r.resubmitted ? 'hw_redone' : 'hw_done', { title: esc(hw.title) }))];
    }

    if (input.kind === 'button') {
      const [kind, arg] = input.data.split(':');
      if (kind === 'lang' && (arg === 'uz' || arg === 'ru' || arg === 'en')) {
        l = arg;
        await save({ ...state, locale: l });
        await deps.call(actor, 'bot.setLocale', { locale: l });
        return [home(bt(l, 'lang_set'))];
      }
      if (kind === 'hw' && arg && m.role === 'student') {
        const list = await deps.call(actor, 'homework.mine', {});
        const hw = list.find((h) => h.id === arg);
        if (!hw) return [home(bt(l, 'hw_empty'))];
        if (hw.grade !== null) return [home(bt(l, 'hw_graded_already'))];
        await save({ ...state, awaitingHomework: { id: hw.id, title: hw.title } });
        return [{ text: bt(l, 'hw_send', { title: esc(hw.title) }), inline: [[{ text: bt(l, 'btn.cancel'), data: 'cancel' }]] }];
      }
      if (kind === 'cancel') {
        await save({ ...state, awaitingHomework: null });
        return [home(bt(l, 'welcome', { name: esc(user.first_name) }))];
      }
      return [home(bt(l, 'unknown'))];
    }

    const action = input.kind === 'text' ? actionOf(input.text) : null;
    if (state.awaitingHomework && (action === 'btn.cancel' || action === 'btn.back')) await save({ ...state, awaitingHomework: null });
    switch (action) {
      case 'btn.schedule':
        return [home(await scheduleText(deps, actor, l))];
      case 'btn.balance':
        return [home(await balanceText(deps, actor, l))];
      case 'btn.homework':
        return [await homeworkText(deps, actor, m.role, l)].map((r) => (r.inline ? r : home(r.text)));
      case 'btn.grades':
        return [home(await gradesText(deps, actor, l))];
      case 'btn.today':
        return [home(await todayText(deps, actor, l))];
      case 'btn.language':
        return [{ text: 'Tilni tanlang · Выберите язык · Choose a language', inline: [[{ text: "O'zbekcha", data: 'lang:uz' }, { text: 'Русский', data: 'lang:ru' }, { text: 'English', data: 'lang:en' }]] }];
      default:
        if (input.kind === 'start' || action === 'btn.back' || action === 'btn.cancel') return [home(bt(l, 'welcome', { name: esc(user.first_name) }))];
        if (m.role !== 'student' && m.role !== 'parent' && input.kind === 'text') return [home(bt(l, 'staff_hint'))];
        return [home(bt(l, 'unknown'))];
    }
  } catch (e) {
    if (isDomainError(e) && e.details.reason === 'GRADED') return [home(bt(l, 'hw_graded_already'))];
    throw e;
  }
}

async function balanceText(deps: BotDeps, actor: Actor, l: Locale): Promise<string> {
  const kids = await childrenOf(deps, actor);
  const parts: string[] = [];
  for (const k of kids) {
    const st = await deps.call(actor, 'billing.statement', { studentId: k.id });
    const last = st.payments.find((p) => p.status === 'paid');
    const lastText = last ? `${formatMoney(last.amount, l)} · ${last.paidAt!.slice(0, 10)}` : bt(l, 'none');
    parts.push(st.debt > 0
      ? bt(l, 'balance', { name: esc(k.name), debt: formatMoney(st.debt, l), overdue: st.overdue > 0 ? formatMoney(st.overdue, l) : bt(l, 'none'), last: lastText })
      : bt(l, 'balance_ok', { name: esc(k.name), credit: formatMoney(st.credit, l) }));
  }
  return `${parts.join('\n\n')}\n\n${bt(l, 'pay_hint')}`;
}

/** The students this bot user can see: themselves, or every child of a parent. */
export async function childrenOf(deps: BotDeps, actor: Actor): Promise<Array<{ id: string; name: string }>> {
  return (await deps.call(actor, 'family.children', {})).map((c) => ({ id: c.id, name: c.fullName }));
}
