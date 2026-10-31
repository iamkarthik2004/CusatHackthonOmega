# Tally

Tally is a modular-monolith subscription and financial operations workspace for Brightloop Software.

## Local development

1. Install Node.js 20+ and PostgreSQL 16+ locally (Docker is not required).
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `SESSION_SECRET`.
3. Install dependencies: `npm install`.
4. Start both applications: `npm run dev`.
5. Open [http://localhost:5173](http://localhost:5173). The API health check is at [http://localhost:4000/health](http://localhost:4000/health).

Apply the SQL migrations in order with PostgreSQL:

```powershell
psql "$env:DATABASE_URL" -f apps/api/src/database/001_initial.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/002_auth.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/003_financial_operations.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/004_quotations.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/005_tax_discount_lifecycle.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/006_automation_reconciliation.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/seed.sql
```

The current foundation includes a strict shared financial package, PostgreSQL migrations with financial constraints and billing idempotency keys, Argon2 authentication with HTTP-only sessions, role-protected catalog and subscription endpoints, dashboard/reporting/billing-preview endpoints, and a responsive Tally workspace. Monetary values are represented in paise and normalized MRR uses the daily/weekly/monthly/yearly rules from the product specification.

Customer accounts use a separate portal surface. They can browse available plans, request subscriptions, review and accept their own quotations, inspect personal GST totals, run personal integrity checks, and preview subscription-change proration. Business-wide billing execution, reports, reconciliation, staff management, audit logs, Integrity Lab runs, and simulated-clock controls remain restricted to administrators and staff.

## Commands

- `npm run typecheck` — TypeScript checks for all workspaces.
- `npm test` — API tests.
- `npm run build` — production builds.

When `DATABASE_URL` is set, authentication, customers, products, plans, quotations, subscriptions, GST/tax rules, discounts, invoices, PDF downloads, billing runs, payment allocation integrity, lifecycle events, reports, anomaly detection, leakage detection, reconciliation previews, integrity runs, and the simulated clock use PostgreSQL. Without it, the dashboard and fixture preview remain available while protected database operations return an explicit configuration error. The seed script creates 10,000 coherent demo customers, subscriptions, invoices, and payments. No credentials or external service integrations are included.
