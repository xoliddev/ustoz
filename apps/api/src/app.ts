/**
 * Fastify HTTP API. One generic route per contract method: POST /v1/<method> → auth → rate limit → zod →
 * backend method (which checks the permission and runs under RLS). Plus Telegram login, payment webhooks
 * (Payme / Click / Uzum, sandbox), the Telegram bot webhook and /healthz.
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { webhookCallback, type Bot } from 'grammy';
import { z } from 'zod';
import { httpStatusFor, isDomainError, ROLES, timingSafeEqual, validateInitData } from '@ustoz/core';
import { ApiError, isRoute, ROUTES, validate, type RouteDef } from '@ustoz/contract';
import type { Actor, Backend } from '@ustoz/db';
import { handleClick, handlePayme, handleUzum, type ProvidersConfig, type UzumOp } from '@ustoz/payments';
import { bearerOf, createTokenService } from './auth';
import { DEFAULT_LIMITS, RateLimiter, type LimitGroup } from './limits';

export interface ApiConfig {
  botToken?: string;
  botWebhookSecret?: string;
  jwtSecret: string;
  corsOrigins: string[];
  initDataMaxAgeSec: number;
  nodeEnv: 'development' | 'test' | 'production';
  trustProxy?: boolean;
  providers: ProvidersConfig;
  limits?: Partial<Record<LimitGroup, number>>;
}

export interface BuildAppOptions {
  backend: Backend;
  config: ApiConfig;
  bot?: Bot | null;
  logger?: boolean;
}

const errorBody = (code: string, message: string, details: Record<string, unknown> = {}) => ({ error: { code, message, details } });
const loginBody = z.object({ initData: z.string().min(1).max(8192), centreId: z.string().uuid().optional(), role: z.enum(ROLES).optional() });
const switchBody = z.object({ centreId: z.string().uuid(), role: z.enum(ROLES) });

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null;
  }
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { backend, config } = opts;
  const tokens = createTokenService(config.jwtSecret, () => backend.ctx.now());
  const limiter = new RateLimiter({ ...DEFAULT_LIMITS, ...config.limits });
  const app = Fastify({ logger: opts.logger ? { level: 'info', redact: ['req.headers.authorization', '*.initData', '*.token'] } : false, bodyLimit: 2 * 1024 * 1024, trustProxy: config.trustProxy ?? false });

  app.decorateRequest('actor', null);
  // Click posts application/x-www-form-urlencoded
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    } catch (e) {
      done(e as Error);
    }
  });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('cache-control', 'no-store');
    if (config.nodeEnv === 'production') reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    const token = bearerOf(req.headers.authorization);
    req.actor = token ? await tokens.verify(token) : null;
  });

  await app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : false, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['authorization', 'content-type'], maxAge: 600 });

  const limit = (group: LimitGroup, req: FastifyRequest, reply: FastifyReply): boolean => {
    const key = group === 'auth' || group === 'public' || group === 'webhook' || !req.actor?.userId ? `ip:${req.ip}` : `u:${req.actor.userId}`;
    const wait = limiter.hit(group, key);
    if (wait === null) return true;
    void reply.code(429).header('retry-after', String(wait)).send(errorBody('RATE_LIMITED', 'Too many requests'));
    return false;
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.code(err.status).send(errorBody(err.code, err.message, err.details));
    if (isDomainError(err)) return reply.code(httpStatusFor(err.code)).send(errorBody(err.code, err.message, err.details));
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send(errorBody('VALIDATION', e.message ?? 'Bad request'));
    app.log.error(err);
    return reply.code(500).send(errorBody('INTERNAL', 'Internal error'));
  });

  app.get('/healthz', async () => {
    await backend.ctx.db.query('select 1');
    return { ok: true };
  });

  // ── Telegram Mini App login: real HMAC check of initData + auth_date freshness ──
  app.post('/v1/auth/telegram', async (req, reply) => {
    if (!limit('auth', req, reply)) return reply;
    const body = loginBody.safeParse(req.body);
    if (!body.success) throw new ApiError('VALIDATION', 'initData required', { field: 'initData' });
    if (!config.botToken) throw new ApiError('UNAUTHENTICATED', 'Telegram login is not configured', {}, 401);
    const v = await validateInitData(body.data.initData, config.botToken, { now: backend.ctx.now(), maxAgeSec: config.initDataMaxAgeSec });
    const want = body.data.centreId || body.data.role ? { centreId: body.data.centreId, role: body.data.role } : undefined;
    const { user, memberships, actor } = await backend.signIn(v.user, want);
    return { token: actor.role ? await tokens.issue(actor) : null, user, memberships, role: actor.role, centreId: actor.centreId };
  });

  app.post('/v1/auth/switch', async (req, reply) => {
    if (!limit('auth', req, reply)) return reply;
    if (!req.actor?.userId) throw new ApiError('UNAUTHENTICATED', 'Sign in first', {}, 401);
    const body = switchBody.safeParse(req.body);
    if (!body.success) throw new ApiError('VALIDATION', 'centreId and role required');
    const actor = await backend.actorForUser(req.actor.userId, body.data);
    return { token: await tokens.issue(actor), role: actor.role, centreId: actor.centreId };
  });

  // ── every contract method ──
  app.post<{ Params: { method: string } }>('/v1/:method', async (req, reply) => {
    const name = req.params.method;
    if (!isRoute(name)) throw new ApiError('NOT_FOUND', 'Unknown method', {}, 404);
    const def = ROUTES[name] as RouteDef;
    if (def.auth === 'user' && !req.actor?.userId) throw new ApiError('UNAUTHENTICATED', 'Missing or invalid token', {}, 401);
    if (!limit(def.rate ?? 'default', req, reply)) return reply;
    const input = validate(name, req.body);
    const fn = backend.methods[name] as (a: Actor, i: unknown) => Promise<unknown>;
    const out = await fn(req.actor ?? { userId: null, telegramId: null, locale: 'uz', centreId: null, role: null }, input);
    return out ?? { ok: true };
  });

  // ── payment provider callbacks (sandbox). Payme answers JSON-RPC with HTTP 200 even for errors. ──
  app.post('/hooks/payme', async (req, reply) => {
    if (!limit('webhook', req, reply)) return reply;
    if (!config.providers.payme) throw new ApiError('NOT_FOUND', 'Payme is not configured', {}, 404);
    return handlePayme(backend.ledger, config.providers.payme, { authorization: req.headers.authorization, body: req.body }, backend.ctx.now());
  });
  app.post('/hooks/click/:action', async (req, reply) => {
    if (!limit('webhook', req, reply)) return reply;
    if (!config.providers.click) throw new ApiError('NOT_FOUND', 'Click is not configured', {}, 404);
    return handleClick(backend.ledger, config.providers.click, (req.body ?? {}) as Record<string, string>, backend.ctx.now());
  });
  app.post<{ Params: { op: string } }>('/hooks/uzum/:op', async (req, reply) => {
    if (!limit('webhook', req, reply)) return reply;
    if (!config.providers.uzum) throw new ApiError('NOT_FOUND', 'Uzum is not configured', {}, 404);
    const op = req.params.op as UzumOp;
    if (!['check', 'create', 'confirm', 'reverse', 'status'].includes(op)) throw new ApiError('NOT_FOUND', 'Unknown operation', {}, 404);
    const r = await handleUzum(backend.ledger, config.providers.uzum, op, { authorization: req.headers.authorization, body: req.body }, backend.ctx.now());
    return reply.code(r.status).send(r.body);
  });

  // ── Telegram bot webhook: only with the secret token Telegram echoes back ──
  if (opts.bot && config.botWebhookSecret) {
    const handle = webhookCallback(opts.bot, 'fastify', { secretToken: config.botWebhookSecret });
    const secret = config.botWebhookSecret;
    app.post('/hooks/telegram', async (req, reply) => {
      if (!limit('webhook', req, reply)) return reply;
      const got = String(req.headers['x-telegram-bot-api-secret-token'] ?? '');
      if (!timingSafeEqual(got, secret)) return reply.code(401).send(errorBody('UNAUTHENTICATED', 'Bad secret'));
      return handle(req, reply);
    });
  }

  return app;
}
