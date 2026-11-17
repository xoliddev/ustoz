/** BotDeps backed directly by the application services (used by apps/bot and by the demo worker). */
import type { Backend } from '@ustoz/db';
import type { BotDeps } from './engine';

export function backendBotDeps(be: Backend, opts: { centreName: string; miniAppUrl: string }): BotDeps {
  return {
    ...opts,
    async identify(user) {
      const { user: u, memberships } = await be.signIn(user);
      return { userId: u.id, memberships, actorFor: (role, centreId) => be.actorForUser(u.id, { role, centreId }) };
    },
    claim: (userId, telegramId, phone) => be.claimByPhone(userId, telegramId, phone),
    call: (actor, name, input) => (be.methods[name] as (a: typeof actor, i: typeof input) => Promise<never>)(actor, input),
  };
}
