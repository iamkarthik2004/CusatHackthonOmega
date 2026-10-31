# AGENTS.md

Tally is an npm-workspaces monorepo: React/Vite web app, Express API, and a shared Zod/finance package. Use npm (`package-lock.json`); `pnpm-workspace.yaml` is leftover and there is no pnpm lockfile.

## Layout

- `apps/api` — Express + `pg`; every route is in `src/app.ts` (`createApp`), entrypoint `src/server.ts`.
- `apps/web` — React 18 + Vite; almost all UI is in `src/App.tsx`.
- `packages/shared` — Zod schemas, roles/statuses, money/MRR helpers; both apps import its built `dist/`.
- `apps/api/src/database/*.sql` — plain SQL migrations applied manually in numeric order; there is no migration runner.

## Commands

- `npm run dev` — API on :4000 and web on :5173 together.
- `npm run typecheck` / `npm run build` — shared, then api, then web; keep that order because the apps consume `@tally/shared/dist`.
- `npm test` — builds shared, then runs the API Vitest suite.
- Single test: `npm run test -w apps/api -- src/modules/quotations/calculations.test.ts`
- No lint or formatter config exists; verify with typecheck, tests, and build.

## Setup and environment

- `.env` is not auto-loaded: the dev scripts use neither dotenv nor `--env-file`. Export variables in the shell (`$env:DATABASE_URL=...` in PowerShell) or invoke tsx with `--env-file=.env`.
- Code reads only `DATABASE_URL`, `API_PORT`, `WEB_ORIGIN`, and `COOKIE_SECURE`; `SESSION_SECRET` from `.env.example` is unused.
- Apply `001` through `004` then `seed.sql` with psql (exact commands in README). The seed creates 10,000 customers and is slow.
- No admin user is seeded: `/api/auth/register` always creates a `CUSTOMER`. Promote manually (`UPDATE users SET role = 'ADMIN'`) to exercise admin-only endpoints.
- Without `DATABASE_URL`, only `/health`, `/api/dashboard`, and `/api/billing/preview-fixture` are usable; authenticated routes return 401/503.

## Conventions and gotchas

- All money is integer paise (`*_paise`, `*Paise`); never introduce floats. MRR normalization lives in `packages/shared/src/index.ts`.
- Tax units differ: quotation APIs take `taxRateBps` basis points (1800 = 18%), while `calculateInvoiceTotals` takes a decimal rate (0.18).
- The API is ESM (`"type": "module"`, NodeNext): relative imports in TS source must end in `.js`.
- Rebuild `packages/shared` after editing it; API and Vite both resolve its `dist/`, so changes are invisible until rebuilt.
- The web API base URL is hardcoded in `apps/web/src/App.tsx` (`const api = "http://localhost:4000"`) with no Vite proxy. Changing `API_PORT` requires updating it; CORS uses `WEB_ORIGIN`.
- Tests do not require PostgreSQL: they cover the health check, unauthenticated rejection, and pure calculation helpers.
- Roles are `ADMIN`, `STAFF`, `CUSTOMER`; customer-scoped queries filter on `customers.user_id`.
