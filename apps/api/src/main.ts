/**
 * Production entry: env → Postgres → migrations → backend → bot (optional) → HTTP.
 * Background jobs: monthly billing (idempotent, hourly) and the bot outbox deliverer (every 3 s).
 */
import { createBot, deliverOutbox } from '@ustoz/bot';
import { systemClock } from '@ustoz/core';
import { createBackend, migrate } from '@ustoz/db';
import { createPgDatabase } from '@ustoz/db/pg';
import { createPaymentsPort, type ProvidersConfig } from '@ustoz/payments';
import { createTestGenerator } from './ai';
import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const providers: ProvidersConfig = {
  ...(env.PAYME_MERCHANT_ID && env.PAYME_TEST_KEY ? { payme: { mode: env.PAYMENTS_MODE, merchantId: env.PAYME_MERCHANT_ID, key: env.PAYME_TEST_KEY } } : {}),
  ...(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY ? { click: { mode: env.PAYMENTS_MODE, serviceId: env.CLICK_SERVICE_ID, merchantId: env.CLICK_MERCHANT_ID, secretKey: env.CLICK_SECRET_KEY } } : {}),
  ...(env.UZUM_SERVICE_ID && env.UZUM_LOGIN && env.UZUM_PASSWORD ? { uzum: { mode: env.PAYMENTS_MODE, serviceId: env.UZUM_SERVICE_ID, login: env.UZUM_LOGIN, password: env.UZUM_PASSWORD } } : {}),
};

const db = createPgDatabase(env.DATABASE_URL);
const applied = await migrate(db);
const backend = createBackend({
  db,
  clock: systemClock,
  certSecret: env.CERT_SECRET,
  verifyBase: `${env.MINIAPP_URL.replace(/\/$/, '')}/#/verify/`,
  testGenerator: createTestGenerator(env),
  payments: Object.keys(providers).length ? createPaymentsPort(providers) : undefined,
});

const bot = env.BOT_TOKEN ? createBot(env.BOT_TOKEN, backend, { centreName: env.CENTRE_NAME, miniAppUrl: env.MINIAPP_URL }) : null;
if (bot) await bot.init();

const app = await buildApp({
  backend, bot, logger: true,
  config: { botToken: env.BOT_TOKEN, botWebhookSecret: env.BOT_WEBHOOK_SECRET, jwtSecret: env.JWT_SECRET, corsOrigins: env.CORS_ORIGINS, initDataMaxAgeSec: env.INITDATA_MAX_AGE_SEC, nodeEnv: env.NODE_ENV, trustProxy: env.TRUST_PROXY, providers },
});

const timers: NodeJS.Timeout[] = [];
const safely = (name: string, fn: () => Promise<unknown>) => () => void fn().catch((e) => app.log.error({ job: name, err: e instanceof Error ? e.message : String(e) }));
const billing = safely('billing', () => backend.runMonthlyBilling());
billing();
timers.push(setInterval(billing, 3600_000));
if (bot) timers.push(setInterval(safely('outbox', () => deliverOutbox(bot.api, backend)), 3000));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
app.log.info({ migrations: applied, bot: !!bot, providers: Object.keys(providers) }, 'ustoz api ready');

const stop = async () => {
  timers.forEach(clearInterval);
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
