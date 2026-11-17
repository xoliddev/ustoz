/**
 * grammY adapter: maps Telegram updates onto the shared conversation engine (@ustoz/botkit) and renders its
 * replies as keyboards. Private chats only; every update id is processed once (Telegram retries webhooks).
 */
import { Bot, InlineKeyboard, Keyboard, type Api, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { backendBotDeps, handleUpdate, type BotInput, type BotReply } from '@ustoz/botkit';
import type { TelegramUser } from '@ustoz/core';
import { SYSTEM, type Backend } from '@ustoz/db';
import { bt, renderNotification, type Locale } from '@ustoz/i18n';

export interface BotOptions {
  centreName: string;
  miniAppUrl: string;
  /** Skips getMe (tests, or when the info is cached). */
  botInfo?: UserFromGetMe;
  log?: (m: Record<string, unknown>) => void;
}

export function markup(r: BotReply) {
  if (r.inline) {
    const kb = new InlineKeyboard();
    r.inline.forEach((row, i) => {
      if (i) kb.row();
      for (const b of row) (b.webApp ? kb.webApp(b.text, b.webApp) : kb.text(b.text, b.data ?? b.text));
    });
    return kb;
  }
  if (r.reply) {
    const kb = new Keyboard();
    r.reply.forEach((row, i) => {
      if (i) kb.row();
      for (const b of row) (b.requestContact ? kb.requestContact(b.text) : b.webApp ? kb.webApp(b.text, b.webApp) : kb.text(b.text));
    });
    return kb.resized().persistent();
  }
  return undefined;
}

async function firstTime(be: Backend, updateId: number): Promise<boolean> {
  const r = await be.ctx.db.query('insert into processed_updates (update_id) values ($1) on conflict do nothing returning update_id', [updateId]);
  return r.length > 0;
}

export function createBot(token: string, be: Backend, opts: BotOptions): Bot {
  const bot = new Bot(token, opts.botInfo ? { botInfo: opts.botInfo } : undefined);
  const deps = backendBotDeps(be, { centreName: opts.centreName, miniAppUrl: opts.miniAppUrl });
  const log = opts.log ?? ((m) => console.log(JSON.stringify(m)));

  const run = async (ctx: Context, input: BotInput) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return;
    const user: TelegramUser = { id: ctx.from.id, first_name: ctx.from.first_name, last_name: ctx.from.last_name, username: ctx.from.username, language_code: ctx.from.language_code };
    const replies = await handleUpdate(deps, user, input);
    for (const r of replies) await ctx.reply(r.text, { parse_mode: 'HTML', reply_markup: markup(r), link_preview_options: { is_disabled: true } });
  };

  bot.use(async (ctx, next) => {
    if (await firstTime(be, ctx.update.update_id)) await next();
  });
  bot.command('start', (ctx) => run(ctx, { kind: 'start' }));
  bot.on('message:contact', (ctx) => run(ctx, { kind: 'contact', phone: ctx.message.contact.phone_number, own: ctx.message.contact.user_id === ctx.from.id }));
  bot.on('message:photo', (ctx) => {
    const p = ctx.message.photo.at(-1)!;
    return run(ctx, { kind: 'photo', fileName: `photo_${p.file_unique_id}.jpg`, dataUrl: `telegram-file:${p.file_id}`, caption: ctx.message.caption });
  });
  bot.on('message:document', (ctx) => {
    const d = ctx.message.document;
    return run(ctx, { kind: 'document', fileName: d.file_name ?? `file_${d.file_unique_id}`, dataUrl: `telegram-file:${d.file_id}`, caption: ctx.message.caption });
  });
  bot.on('message:text', (ctx) => run(ctx, { kind: 'text', text: ctx.message.text }));
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
    await run(ctx, { kind: 'button', data: ctx.callbackQuery.data });
  });
  bot.catch(async (err) => {
    log({ level: 'error', msg: 'bot update failed', error: err.error instanceof Error ? err.error.message : String(err.error) });
    const l = (err.ctx.from?.language_code === 'ru' || err.ctx.from?.language_code === 'en' ? err.ctx.from.language_code : 'uz') as Locale;
    await err.ctx.reply(bt(l, 'error')).catch(() => undefined);
  });
  return bot;
}

/**
 * Sends queued notifications (the transactional outbox). Each message is attempted at most 5 times;
 * Telegram's 429 leaves it queued for the next round.
 */
export async function deliverOutbox(api: Api, be: Backend, limit = 25): Promise<{ sent: number; failed: number }> {
  const rows = await be.ctx.tx(null, SYSTEM, (tx) =>
    tx.query<{ id: string; recipientTg: number; template: string; params: Record<string, unknown>; locale: Locale }>('select * from claim_outbox($1)', [limit]),
  );
  let sent = 0;
  let failed = 0;
  for (const m of rows) {
    try {
      await api.sendMessage(m.recipientTg, renderNotification(m.template, m.params, m.locale), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      await be.ctx.tx(null, SYSTEM, (tx) => tx.query('select mark_outbox($1, true, null)', [m.id]));
      sent++;
    } catch (e) {
      await be.ctx.tx(null, SYSTEM, (tx) => tx.query('select mark_outbox($1, false, $2)', [m.id, e instanceof Error ? e.message : String(e)]));
      failed++;
    }
  }
  return { sent, failed };
}
