# Tally by Brightloop

> **The books prove themselves.**  
> A modular-monolith subscription management, financial operations, and revenue intelligence platform engineered with mathematical rigor, double-entry integrity invariants, multi-tier pricing, automated billing runs, and a dedicated customer self-service portal.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
  - [Financial Core & Mathematical Invariants](#financial-core--mathematical-invariants)
  - [Role-Based Access Control & Dual Portal Surfaces](#role-based-access-control--dual-portal-surfaces)
  - [Billing & Lifecycle Operations](#billing--lifecycle-operations)
  - [Intelligence, Integrity Lab & Reconciliation](#intelligence-integrity-lab--reconciliation)
  - [Simulated System Clock & Time-Travel Testing](#simulated-system-clock--time-travel-testing)
- [Monorepo Architecture](#monorepo-architecture)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Installation](#2-installation)
  - [3. Database Migrations & Seeding](#3-database-migrations--seeding)
  - [4. Administrator Account Setup](#4-administrator-account-setup)
  - [5. Running the Application](#5-running-the-application)
- [Commands & Workspaces](#commands--workspaces)
- [API Reference](#api-reference)
- [Engineering Conventions & Gotchas](#engineering-conventions--gotchas)

---

## Overview

Tally is designed for modern subscription businesses that demand absolute ledger consistency and auditability. Rather than treating billing as a set of loose CRUD operations, Tally implements:
- **Strict Integer Arithmetic**: All monetary quantities are tracked in integer paise (`*_paise`), completely eliminating floating-point rounding errors.
- **Ledger Invariants**: Double-entry balance checks guarantee that every invoice allocation matches receipts and credit adjustments.
- **Idempotent Billing Runs**: Batch execution engines safeguard against double-billing using deterministic idempotency keys and state machine transitions.
- **Dual User Surfaces**: Segregated operational spaces for internal operators (Admin/Staff) and external subscribers (Customers).

---

## Key Features

### Financial Core & Mathematical Invariants
- **Zero Floating-Point Money**: Every calculation (line items, discounts, GST, credits, balances) is performed in integer paise.
- **Normalized MRR / ARR**: Standardized Monthly Recurring Revenue normalization across daily, weekly, monthly, quarterly, and annual billing cadences.
- **Taxation Engine**: Basis-point configured tax rules (`taxRateBps`) supporting Indian GST breakdowns (CGST, SGST, IGST) with taxable previews.
- **Discount Engine**: Percentage-based and fixed-paise promotional discounts with automatic expiration and usage constraints.

### Role-Based Access Control & Dual Portal Surfaces
- **Role Hierarchy**: Strict permission gates for `ADMIN`, `STAFF`, and `CUSTOMER`.
- **Admin & Staff Workspace**:
  - **Financial Command Center**: Real-time KPI summaries (MRR, ARR, active subscriber counts, aging receivables, churn risk).
  - **Revenue Analytics**: Interactive MRR movement trend charts (Recharts) and MRR waterfall reports.
  - **Action Queue & Dunning**: Automated chase lists for overdue invoices and renewal alerts.
  - **Catalog Management**: Dynamic product and pricing plan definitions.
  - **Quotation Workflow**: Draft quotes, generate shareable acceptance links with secure public tokens, and convert accepted quotes into active subscriptions.
  - **Invoice Management**: Invoices with complete lifecycle states (`DRAFT`, `ISSUED`, `PAID`, `OVERDUE`, `VOID`) and on-demand PDF generation.
  - **Audit Logging**: Comprehensive, append-only audit trail capturing administrative and billing actions.
- **Customer Self-Service Portal**:
  - Browse public plans and submit new subscription requests.
  - Review and accept issued quotations directly online.
  - Manage existing subscriptions with instant proration previews for upgrades/downgrades.
  - View invoices, inspect real-time GST breakdowns, and download official PDF receipts.
  - Execute personal account integrity checks to independently verify billing records.

### Billing & Lifecycle Operations
- **Automated Billing Engine**: Batch processes invoice generation and subscription renewal runs with unique run idempotency keys.
- **Subscription Lifecycle States**: Clean state transitions (`ACTIVE`, `PAUSED`, `CLOSED`, `CANCELLED`).
- **Proration Calculator**: Real-time calculation of credit and charge adjustments for mid-cycle plan changes.

### Intelligence, Integrity Lab & Reconciliation
- **Integrity Lab**: Integrated verification suite testing system-wide invariants (payment allocations, balance reconciliations, non-negative balances).
- **Revenue Leakage & Anomaly Detection**: Automated scanners detecting unbilled usage, under-allocated payments, and orphaned subscriptions.
- **Bank & Payment Reconciliation**: Import and match external bank settlement records against system payments.

### Simulated System Clock & Time-Travel Testing
- Full administrative control to advance the system clock (`/api/system-clock`).
- Enables rigorous end-to-end testing of renewal cycles, dunning schedules, grace periods, and proration without waiting in real time.

---

## Monorepo Architecture

Tally is structured as an npm workspaces monorepo:

```
.
├── apps/
│   ├── api/             # Express 4 + PostgreSQL backend (ESM NodeNext)
│   │   ├── src/
│   │   │   ├── app.ts            # Centralized API router & application factory
│   │   │   ├── server.ts         # Server entrypoint & port listener
│   │   │   ├── database/         # PostgreSQL schema migrations (001-006) & seed script
│   │   │   ├── modules/          # Auth, quotations, calculations & business logic
│   │   │   └── types/            # TypeScript declarations
│   └── web/             # React 18 + Vite dashboard & Customer Portal
│       ├── src/
│       │   ├── App.tsx           # Primary UI, navigation, role surfaces & views
│       │   ├── main.tsx          # React application root
│       │   └── styles.css        # Responsive workspace design system
│   └── frontend/        # Redesigned standalone frontend workspace
├── packages/
│   └── shared/          # Shared Zod schemas, role definitions & money/MRR math
│       ├── src/
│       │   ├── index.ts          # Core domain validation and calculation functions
│       │   └── index.test.ts     # Domain math unit test suite
│       └── dist/                 # Compiled JavaScript & declaration files consumed by apps
├── package.json         # Root workspace scripts and dependencies
├── package-lock.json    # Canonical lockfile
└── requirements.txt     # Dependency reference & version specifications
```

---

## Environment Variables

Configure environment variables in your shell or via an `.env` file:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | *Required for persistence* (e.g. `postgresql://postgres:postgres@localhost:5432/tally`) |
| `API_PORT` | Port number for the Express API server | `4000` |
| `WEB_ORIGIN` | Allowed origin for CORS in the API | `http://localhost:5173` |
| `COOKIE_SECURE` | Set to `true` to require HTTPS for session cookies | `false` |

> **Note**: dev scripts do not auto-load `.env` via `dotenv`. In PowerShell, set variables using `$env:DATABASE_URL="..."`, or launch Node/tsx with `--env-file=.env`. Without `DATABASE_URL`, the application operates in demo fixture mode (serving `/health`, `/api/dashboard`, and preview fixtures).

---

## Local Development Setup

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **PostgreSQL**: v16.0 or higher (local service or managed instance)

### 2. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/iamomega4454/CusatHackthonOmega.git
cd CusatHackthonOmega
npm install
```

### 3. Database Migrations & Seeding
Create a PostgreSQL database (e.g. `tally`) and apply migrations sequentially:

#### PowerShell (Windows):
```powershell
$env:DATABASE_URL = "postgresql://postgres:password@localhost:5432/tally"

psql "$env:DATABASE_URL" -f apps/api/src/database/001_initial.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/002_auth.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/003_financial_operations.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/004_quotations.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/005_tax_discount_lifecycle.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/006_automation_reconciliation.sql
psql "$env:DATABASE_URL" -f apps/api/src/database/seed.sql
```

#### Bash (macOS / Linux):
```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/tally"

psql "$DATABASE_URL" -f apps/api/src/database/001_initial.sql
psql "$DATABASE_URL" -f apps/api/src/database/002_auth.sql
psql "$DATABASE_URL" -f apps/api/src/database/003_financial_operations.sql
psql "$DATABASE_URL" -f apps/api/src/database/004_quotations.sql
psql "$DATABASE_URL" -f apps/api/src/database/005_tax_discount_lifecycle.sql
psql "$DATABASE_URL" -f apps/api/src/database/006_automation_reconciliation.sql
psql "$DATABASE_URL" -f apps/api/src/database/seed.sql
```

> **Seed Data Note**: `seed.sql` populates 10,000 coherent customer accounts, subscriptions, invoices, and payments to simulate high-volume billing operations.

### 4. Administrator Account Setup
Register a new account via the UI or API (`POST /api/auth/register`). All new registrations default to the `CUSTOMER` role. To grant administrative privileges:
```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

### 5. Running the Application
Start both the Express API and React Vite dev servers concurrently:
```bash
npm run dev
```

- **Web Application**: [http://localhost:5173](http://localhost:5173)
- **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)

---

## Commands & Workspaces

All commands are executed from the repository root:

| Command | Action |
|---|---|
| `npm run dev` | Runs API (`:4000`) and Web (`:5173`) concurrently |
| `npm run build` | Builds `@tally/shared`, then `apps/api`, then `apps/web` |
| `npm run typecheck` | Validates TypeScript types across all workspaces |
| `npm test` | Builds shared package and executes Vitest test suites |
| `npm run test -w apps/api -- <path>` | Runs a specific API test file |
| `npm run dev -w frontend` | Starts the standalone redesigned frontend UI |

---

## API Reference

### Health & Authentication
- `GET /health` — Service health probe.
- `POST /api/auth/register` — Create new customer credentials.
- `POST /api/auth/login` — Authenticate and issue HTTP-only session cookie.
- `POST /api/auth/logout` — Invalidate active session.
- `GET /api/auth/me` — Retrieve active session user and role profile.

### Staff & Administration
- `GET /api/staff` — List staff members *(Admin only)*.
- `POST /api/staff` — Provision new staff account *(Admin only)*.
- `PATCH /api/staff/:id/status` — Activate/deactivate staff account *(Admin only)*.
- `GET /api/audit-log` — Retrieve administrative audit trail *(Admin/Staff)*.

### Products & Plans
- `GET /api/catalog/products` — List catalog products.
- `POST /api/catalog/products` — Create new product definition *(Admin only)*.
- `GET /api/catalog/plans` — List pricing plans across products.
- `POST /api/catalog/plans` — Create plan with cadence and pricing in paise *(Admin only)*.

### Taxes & Discounts
- `GET /api/taxes` — List configured GST/tax rates *(Admin/Staff)*.
- `POST /api/taxes` — Define new tax rate in basis points *(Admin only)*.
- `POST /api/taxes/preview` — Calculate tax amounts on preview payload.
- `GET /api/discounts` — List discount promotional codes *(Admin/Staff)*.
- `POST /api/discounts` — Create discount rules (percentage or fixed paise) *(Admin only)*.
- `POST /api/discounts/preview` — Test discount application on invoice draft.

### Quotations
- `GET /api/quotations` — List quotations.
- `GET /api/quotations/templates` — List quotation templates.
- `POST /api/quotations/templates` — Create quotation template *(Admin only)*.
- `POST /api/quotations` — Draft and issue quotation *(Admin/Staff)*.
- `POST /api/public/quotations/:token/accept` — Public endpoint for customer quotation acceptance.

### Subscriptions & Lifecycle
- `GET /api/subscriptions` — Query subscriptions with customer filters.
- `POST /api/subscriptions` — Create subscription record.
- `POST /api/subscriptions/:id/lifecycle` — Transition state (`PAUSED`, `ACTIVE`, `CANCELLED`).
- `POST /api/subscriptions/:id/proration-preview` — Preview financial impact of plan change.
- `GET /api/subscriptions/:id/events` — Retrieve chronological subscription event log.

### Invoices & Payments
- `GET /api/invoices` — List invoices with payment statuses and due dates.
- `POST /api/invoices/:id/action` — Trigger status transition or voiding *(Admin/Staff)*.
- `GET /api/invoices/:id/pdf` — Stream generated PDF tax invoice.
- `POST /api/payments` — Record manual or gateway payment with allocation *(Admin/Staff)*.
- `POST /api/reconciliation/import` — Import and reconcile external settlement records *(Admin/Staff)*.

### Billing Automation & System Clock
- `POST /api/billing/preview` — Preview pending invoices for upcoming billing cycle.
- `POST /api/billing/run` — Execute automated billing run with idempotency protection.
- `GET /api/billing/runs/:id/events` — Inspect run execution events and generated invoices.
- `GET /api/system-clock` — Get current simulated system time.
- `PUT /api/system-clock` — Adjust simulated system time for fast-forward testing.

### Intelligence & Integrity Lab
- `POST /api/integrity/run` — Trigger invariant verification check suite *(Admin only)*.
- `GET /api/integrity/runs` — Query history and results of integrity verification runs.
- `GET /api/intelligence/anomalies` — Query detected billing and payment anomalies.
- `GET /api/intelligence/leakage` — Detect unbilled subscriptions and revenue leakage.
- `GET /api/reports/waterfall` — Retrieve MRR movement breakdown (New, Expansion, Contraction, Churn).

### Customer Portal Endpoints
- `GET /api/portal/subscriptions` — Subscriptions owned by authenticated customer.
- `GET /api/portal/plans` — Available subscription plans for self-service signup.
- `POST /api/portal/quotations/:id/accept` — Authenticated quotation acceptance.
- `GET /api/portal/invoices/:id/tax` — Detailed GST breakdown for customer invoice.
- `GET /api/portal/reports/gst` — Aggregated GST tax report for customer filings.
- `GET /api/portal/integrity` — Run scoped ledger integrity check on customer records.
- `POST /api/portal/simulator/proration` — Self-service proration simulator.
- `POST /api/portal/subscriptions/:id/change-request` — Request plan modification or cancellation.
- `GET /api/portal/payments` — Complete history of customer payment settlements.

---

## Engineering Conventions & Gotchas

- **Money is Integer Paise**: Never introduce floating-point numbers for currency. Database columns use `*_paise` (e.g. `amount_paise`, `balance_paise`), and code uses integer math.
- **Tax Rates**: Quotation and invoice calculation logic distinguishes between basis points (`taxRateBps`, where `1800` = 18.00%) and decimal rates (`0.18`). Check function signatures when invoking calculation helpers.
- **Shared Package Rebuilds**: Both `apps/api` and `apps/web` resolve `@tally/shared` from `packages/shared/dist`. Always execute `npm run build -w packages/shared` (or `npm run build`) after modifying shared code.
- **ESM NodeNext Imports**: The API is configured as an ES Module (`"type": "module"`). All relative imports within TypeScript source files must include explicit `.js` extensions (e.g. `import { db } from "./database/client.js"`).
- **Web API Endpoint**: The API host is defined in `apps/web/src/App.tsx` (`const api = "http://localhost:4000"`). When modifying `API_PORT`, update `WEB_ORIGIN` and `api` accordingly.
- **Isolated Testing**: Vitest test suites run in-memory without requiring an active PostgreSQL instance.
