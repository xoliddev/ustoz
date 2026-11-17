# Ustoz API (Fastify + grammY bot + background jobs). The web demo is static and lives on GitHub Pages.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/i18n/package.json packages/i18n/
COPY packages/db/package.json packages/db/
COPY packages/contract/package.json packages/contract/
COPY packages/payments/package.json packages/payments/
COPY packages/seed/package.json packages/seed/
COPY packages/botkit/package.json packages/botkit/
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/bot ./apps/bot
USER node
EXPOSE 4182
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4182/healthz || exit 1
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
