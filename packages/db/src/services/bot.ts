/** Small per-user bot conversation state (awaiting a homework answer, chosen language). */
import { json } from '../client';
import type { Actor, Ctx, Locale } from './ctx';

export interface BotState {
  awaitingHomework?: { id: string; title: string } | null;
  locale?: Locale;
}

export function botService(ctx: Ctx) {
  return {
    async 'bot.state'(a: Actor, _i: Record<string, never>): Promise<BotState> {
      return ctx.as(a, 'outbox.read', async (tx) => {
        const [r] = await tx.query<{ state: BotState }>('select state from bot_state where telegram_id = $1', [a.telegramId]);
        return r?.state ?? {};
      });
    },

    async 'bot.saveState'(a: Actor, i: { state: BotState }) {
      return ctx.as(a, 'outbox.read', async (tx, m) => {
        await tx.query(
          `insert into bot_state (centre_id, telegram_id, state, updated_at) values ($1,$2,$3::jsonb,$4)
           on conflict (centre_id, telegram_id) do update set state = excluded.state, updated_at = excluded.updated_at`,
          [m.centreId, a.telegramId, json(i.state), ctx.now().toISOString()],
        );
        return { ok: true };
      });
    },

    /** Language for both the bot and the notifications this person receives. */
    async 'bot.setLocale'(a: Actor, i: { locale: Locale }) {
      return ctx.as(a, 'outbox.read', async (tx, m) => {
        const table = m.role === 'student' ? 'students' : m.role === 'parent' ? 'parents' : null;
        if (table && m.personId) await tx.query(`update ${table} set locale = $2 where id = $1`, [m.personId, i.locale]);
        await tx.query('update outbox set locale = $2 where recipient_id = $1 and sent_at is null', [m.personId, i.locale]);
        return { ok: true };
      });
    },
  };
}
