# Tally

Tally is a modular-monolith subscription and financial operations workspace for Brightloop Software.

## Local development

1. Install Node.js 20+ and PostgreSQL 16+ locally (Docker is not required).
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `SESSION_SECRET`.
3. Install dependencies: `npm install`.
4. Start both applications: `npm run dev`.
5. Open [http://localhost:5173](http://localhost:5173). The API health check is at [http://localhost:4000/health](http://localhost:4000/health).

The current foundation includes a strict shared financial package, PostgreSQL migrations with financial constraints and billing idempotency keys, Argon2 authentication with HTTP-only sessions, role-protected catalog and subscription endpoints, dashboard/reporting/billing-preview endpoints, and a responsive Tally workspace. Monetary values are represented in paise and normalized MRR uses the daily/weekly/monthly/yearly rules from the product specification.

## Commands

- `npm run typecheck` — TypeScript checks for all workspaces.
- `npm test` — API tests.
- `npm run build` — production builds.

When `DATABASE_URL` is set, authentication, customers, products, plans, and subscriptions use PostgreSQL. Without it, the dashboard and preview remain available with deterministic local fixtures while protected database operations return an explicit configuration error. Background billing execution, payments, reconciliation, portal workflows, and the remaining financial modules are the next slices behind the same service boundaries. No credentials or external service integrations are included.
