# Tally Frontend Web Application

This directory contains the redesigned **Tally by Brightloop** frontend subscription management UI.

## Features
- **Overview Dashboard**: Financial Command Center, real-time KPI metrics, revenue movement trend charts, action queue, upcoming renewals, and explainability audit trail.
- **Customers Management**: Customer directory, search, status filtering, and profile metadata.
- **Subscriptions Management**: Subscription lifecycle tracking (Active, Paused, Closed) with transition actions.
- **Invoices Management**: Due dates, total amounts, overdue alerts, and invoice inspection.
- **Payments Management**: Payment processing logs, status tracking (Successful, Pending, Failed), and settlement tracking.
- **Financial Reports**: MRR movement breakdown waterfall, ARR run-rate extrapolations, and receivables aging analysis.
- **Integrity Lab**: Verification suite validating financial invariants (allocations, state machines, non-negative paise, MRR calculations).

## Getting Started
Within the root workspace:
\`\`\`bash
npm run dev
\`\`\`
Or run only the frontend:
\`\`\`bash
npm run dev -w frontend
\`\`\`
