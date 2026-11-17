# Changelog

All notable changes to this project. Dates are in Tashkent time.

## [1.0.0] — 2026-11-18

### Added
- Core domain in integer tiyin: lesson-based proration with exact largest-remainder shares, sibling / prepaid / custom
  discounts, oldest-first settlement, three salary schemes, schedule-conflict detection on real calendar dates, churn
  risk, lead funnel, Telegram initData validation, deterministic test generator.
- PostgreSQL schema with row-level security on every tenant table, `SECURITY DEFINER` functions for cross-tenant
  lookups, audit log (append-only) and a transactional outbox for bot notifications.
- Application services shared by the API and the in-browser demo: groups and timetable, students, attendance,
  leads, billing and receipts, payroll, homework, tests and leaderboard, certificates, dashboard.
- Payme, Click and Uzum adapters (sandbox only) with signature checks and a sandbox provider player.
- Bot conversation engine (buttons only, uz / ru / en) with a grammY adapter and an outbox deliverer.
- Fastify API: Telegram login → JWT, per-method permissions, zod validation, rate limits, webhooks, security headers.
- Real Claude and Gemini test-generator adapters, off unless a key is set.
- React 19 web app: director/admin/teacher panel, Telegram Mini App in a realistic phone frame, simulated bot chat,
  public certificate verification, role switcher, uz / ru / en.
- GitHub Pages demo on PGlite with a pre-baked snapshot and a timeline seeded relative to today.
- Tests: vitest (property tests with fast-check), DB and API suites on PGlite and PostgreSQL 16, Playwright e2e at
  1440 px and 375 px; CI with a Docker boot check; Pages deployment.
