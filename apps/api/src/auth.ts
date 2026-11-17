/**
 * Short-lived HS256 access tokens issued after Telegram initData validation. The token names the user, the
 * centre and the role they chose; every request still re-checks that membership in the database (Ctx.as),
 * so a revoked role stops working immediately even with an unexpired token.
 */
import { jwtVerify, SignJWT } from 'jose';
import { ROLES, type Role } from '@ustoz/core';
import type { Actor, Locale } from '@ustoz/db';

export const ACCESS_TTL_SEC = 3600;
const ISSUER = 'ustoz';

export interface TokenService {
  issue(a: Actor): Promise<string>;
  verify(token: string): Promise<Actor | null>;
}

export function createTokenService(secret: string, now: () => Date = () => new Date()): TokenService {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(a) {
      const iat = Math.floor(now().getTime() / 1000);
      return new SignJWT({ cid: a.centreId, role: a.role, tg: a.telegramId, loc: a.locale })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(a.userId!)
        .setIssuer(ISSUER)
        .setIssuedAt(iat)
        .setExpirationTime(iat + ACCESS_TTL_SEC)
        .sign(key);
    },
    async verify(token) {
      try {
        const { payload: p } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'], currentDate: now() });
        if (typeof p.sub !== 'string') return null;
        const role = ROLES.includes(p.role as Role) ? (p.role as Role) : null;
        const loc: Locale = p.loc === 'ru' || p.loc === 'en' ? p.loc : 'uz';
        return { userId: p.sub, centreId: typeof p.cid === 'string' ? p.cid : null, role, telegramId: typeof p.tg === 'number' ? p.tg : null, locale: loc };
      } catch {
        return null;
      }
    },
  };
}

export function bearerOf(h: string | undefined): string | null {
  const m = /^Bearer ([A-Za-z0-9._-]{20,2048})$/.exec(h ?? '');
  return m ? m[1]! : null;
}
