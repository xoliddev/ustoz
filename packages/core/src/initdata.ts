/**
 * Telegram Mini App initData validation:
 *   secret = HMAC_SHA256(key = "WebAppData", msg = bot_token)
 *   hash   = hex(HMAC_SHA256(key = secret, msg = data_check_string))
 * data_check_string = "key=value" lines sorted by key, without `hash`. auth_date must be fresh
 * (default 24 h) and not in the future. The demo signs its mock initData with the same code.
 */
import { hmacSha256, timingSafeEqual, toHex } from './crypto';
import { DomainError } from './errors';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface InitData {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
}

export function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  return pairs.sort().join('\n');
}

async function computeHash(params: URLSearchParams, botToken: string): Promise<string> {
  const secret = await hmacSha256('WebAppData', botToken);
  return toHex(await hmacSha256(secret, dataCheckString(params)));
}

/** Clock skew tolerated for auth_date in the future. */
const FUTURE_SKEW_SEC = 60;

export async function validateInitData(initData: string, botToken: string, opts: { maxAgeSec?: number; now?: Date } = {}): Promise<InitData> {
  if (!botToken) throw new DomainError('UNAUTHENTICATED', 'Telegram login is not configured');
  if (initData.length > 8192) throw new DomainError('UNAUTHENTICATED', 'initData too long');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) throw new DomainError('UNAUTHENTICATED', 'initData has no hash');
  const expected = await computeHash(params, botToken);
  if (!timingSafeEqual(expected, hash.toLowerCase())) throw new DomainError('UNAUTHENTICATED', 'initData signature mismatch');
  const authSec = Number(params.get('auth_date'));
  if (!Number.isInteger(authSec) || authSec <= 0) throw new DomainError('UNAUTHENTICATED', 'initData has no auth_date');
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const maxAge = opts.maxAgeSec ?? 86_400;
  if (nowSec - authSec > maxAge) throw new DomainError('UNAUTHENTICATED', 'initData expired');
  if (authSec - nowSec > FUTURE_SKEW_SEC) throw new DomainError('UNAUTHENTICATED', 'initData from the future');
  let user: TelegramUser;
  try {
    user = JSON.parse(params.get('user') ?? '') as TelegramUser;
  } catch {
    throw new DomainError('UNAUTHENTICATED', 'initData user is not JSON');
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') throw new DomainError('UNAUTHENTICATED', 'initData user invalid');
  return { user, authDate: new Date(authSec * 1000), startParam: params.get('start_param') ?? undefined };
}

/** Builds signed initData (the demo's mocked Telegram environment and tests). */
export async function signInitData(fields: { user: TelegramUser; authDate?: Date; startParam?: string }, botToken: string): Promise<string> {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor((fields.authDate ?? new Date()).getTime() / 1000)));
  if (fields.startParam) params.set('start_param', fields.startParam);
  params.set('user', JSON.stringify(fields.user));
  params.set('hash', await computeHash(params, botToken));
  return params.toString();
}
