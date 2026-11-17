/** Environment configuration, validated at startup. Secrets only ever come from the environment. */
import { z } from 'zod';

const csv = z.string().default('').transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4182),
  DATABASE_URL: z.string().url(),
  PUBLIC_URL: z.string().url().default('http://localhost:4182'),
  MINIAPP_URL: z.string().url().default('http://localhost:4180'),
  CORS_ORIGINS: csv,
  BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{30,}$/, 'BOT_TOKEN looks wrong').optional().or(z.literal('').transform(() => undefined)),
  BOT_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{16,256}$/).optional().or(z.literal('').transform(() => undefined)),
  CENTRE_NAME: z.string().default('Ustoz'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CERT_SECRET: z.string().min(32, 'CERT_SECRET must be at least 32 characters'),
  INITDATA_MAX_AGE_SEC: z.coerce.number().int().min(60).max(86_400).default(3600),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  PAYMENTS_MODE: z.literal('sandbox', { message: 'Only PAYMENTS_MODE=sandbox is supported' }).default('sandbox'),
  PAYME_MERCHANT_ID: z.string().optional(),
  PAYME_TEST_KEY: z.string().optional(),
  CLICK_SERVICE_ID: z.string().optional(),
  CLICK_MERCHANT_ID: z.string().optional(),
  CLICK_SECRET_KEY: z.string().optional(),
  UZUM_SERVICE_ID: z.string().optional(),
  UZUM_LOGIN: z.string().optional(),
  UZUM_PASSWORD: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(src: Record<string, string | undefined> = process.env): Env {
  const r = EnvSchema.safeParse(src);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${lines}`);
  }
  return r.data;
}
