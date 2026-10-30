import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import {
  calculateInvoiceTotals, lifecycleTransitions, monthlyRecurringRevenue, type BillingInterval,
  type SubscriptionStatus
} from "@tally/shared";
import { getPool } from "./database/client.js";
import { authenticate, login, logout, parseCredentials, register, requireRole } from "./modules/auth/auth.js";

type Customer = { id: string; name: string; email: string; company: string; status: "Active" | "At risk" };
type Subscription = { id: string; number: string; customerId: string; customer: string; plan: string; interval: BillingInterval; amount: number; status: SubscriptionStatus; nextBilling: string };
type Invoice = { id: string; number: string; customer: string; dueDate: string; total: number; status: "Paid" | "Open" | "Overdue" };

const customers: Customer[] = [
  { id: "cus_1", name: "Arjun Menon", email: "arjun@northstar.io", company: "Northstar Labs", status: "Active" },
  { id: "cus_2", name: "Priya Shah", email: "priya@orbitworks.in", company: "Orbit Works", status: "Active" },
  { id: "cus_3", name: "Rohan Das", email: "rohan@atlasretail.com", company: "Atlas Retail", status: "At risk" }
];
const subscriptions: Subscription[] = [
  { id: "sub_1", number: "SUB-2026-001", customerId: "cus_1", customer: "Northstar Labs", plan: "Scale", interval: "monthly", amount: 1499000, status: "ACTIVE", nextBilling: "2026-11-12" },
  { id: "sub_2", number: "SUB-2026-002", customerId: "cus_2", customer: "Orbit Works", plan: "Growth", interval: "monthly", amount: 699900, status: "ACTIVE", nextBilling: "2026-11-04" },
  { id: "sub_3", number: "SUB-2026-003", customerId: "cus_3", customer: "Atlas Retail", plan: "Starter", interval: "yearly", amount: 4800000, status: "PAUSED", nextBilling: "2027-01-08" }
];
const invoices: Invoice[] = [
  { id: "inv_1", number: "INV-2026-0091", customer: "Northstar Labs", dueDate: "2026-11-12", total: 1762820, status: "Open" },
  { id: "inv_2", number: "INV-2026-0088", customer: "Orbit Works", dueDate: "2026-10-04", total: 825882, status: "Overdue" },
  { id: "inv_3", number: "INV-2026-0084", customer: "Atlas Retail", dueDate: "2026-09-08", total: 5664000, status: "Paid" }
];

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "tally-api" }));
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { email, password } = parseCredentials(req.body);
      const user = await register(email, password);
      return res.status(201).json(user);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = parseCredentials(req.body);
      const user = await login(email, password, res);
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      return res.json(user);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/auth/logout", authenticate, (req, res, next) => logout(req, res).catch(next));
  app.get("/api/auth/me", authenticate, (req, res) => res.json(req.user));
  app.get("/api/catalog/products", authenticate, async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT id, name, description, product_type AS "productType",
                sales_price_paise AS "salesPricePaise", cost_price_paise AS "costPricePaise"
         FROM products ORDER BY created_at DESC`
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/catalog/products", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).default(""),
        productType: z.string().trim().min(1).max(40),
        salesPricePaise: z.number().int().nonnegative(),
        costPricePaise: z.number().int().nonnegative().default(0)
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `INSERT INTO products (name, description, product_type, sales_price_paise, cost_price_paise)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, description, product_type AS "productType",
                   sales_price_paise AS "salesPricePaise", cost_price_paise AS "costPricePaise"`,
        [body.name, body.description, body.productType, body.salesPricePaise, body.costPricePaise]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/catalog/plans", authenticate, async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT id, name, description, amount_paise AS "amountPaise",
                interval, minimum_quantity AS "minimumQuantity",
                available_from AS "availableFrom", available_until AS "availableUntil"
         FROM plans ORDER BY name`
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/catalog/plans", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).default(""),
        amountPaise: z.number().int().nonnegative(),
        interval: z.enum(["daily", "weekly", "monthly", "yearly"]),
        minimumQuantity: z.number().int().positive().default(1),
        availableFrom: z.string().date(),
        availableUntil: z.string().date().optional()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `INSERT INTO plans
          (name, description, amount_paise, interval, minimum_quantity, available_from, available_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, description, amount_paise AS "amountPaise",
                   interval, minimum_quantity AS "minimumQuantity",
                   available_from AS "availableFrom", available_until AS "availableUntil"`,
        [body.name, body.description, body.amountPaise, body.interval, body.minimumQuantity, body.availableFrom, body.availableUntil ?? null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/customers", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json(customers);
      const isCustomer = req.user?.role === "CUSTOMER";
      const result = await pool.query(
        `SELECT c.id, c.legal_name AS name, c.email, c.legal_name AS company,
                CASE WHEN EXISTS (
                  SELECT 1 FROM invoices i
                  WHERE i.customer_id = c.id AND i.status <> 'PAID' AND i.due_on < CURRENT_DATE
                ) THEN 'At risk' ELSE 'Active' END AS status
         FROM customers c
         ${isCustomer ? "WHERE c.user_id = $1" : ""}
         ORDER BY c.legal_name`,
        isCustomer ? [req.user?.id] : []
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/subscriptions", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json(subscriptions);
      const isCustomer = req.user?.role === "CUSTOMER";
      const result = await pool.query(
        `SELECT s.id, s.subscription_number AS number, s.customer_id AS "customerId",
                c.legal_name AS customer, p.name AS plan, p.interval,
                p.amount_paise AS amount, s.status, s.next_billing_on AS "nextBilling"
         FROM subscriptions s
         JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
         ${isCustomer ? "WHERE c.user_id = $1" : ""}
         ORDER BY s.created_at DESC`,
        isCustomer ? [req.user?.id] : []
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/subscriptions", authenticate, async (req, res, next) => {
    try {
      const body = z.object({
        customerId: z.string().uuid().optional(),
        planId: z.string().uuid(),
        startsOn: z.string().date(),
        expiresOn: z.string().date().optional()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const customerResult = await pool.query(
        `SELECT c.id FROM customers c
         WHERE c.id = COALESCE($1::uuid, (SELECT id FROM customers WHERE user_id = $2))
           AND ($3 = 'CUSTOMER' OR $2 = $2)`,
        [body.customerId ?? null, req.user?.id, req.user?.role]
      );
      if (!customerResult.rowCount) return res.status(404).json({ error: "Customer not found" });
      if (req.user?.role === "CUSTOMER" && body.customerId && customerResult.rows[0].id !== body.customerId) {
        return res.status(403).json({ error: "Customers can only create subscriptions for their own account" });
      }
      const number = `SUB-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const result = await pool.query(
        `INSERT INTO subscriptions
          (subscription_number, customer_id, plan_id, status, starts_on, expires_on, next_billing_on)
         VALUES ($1, $2, $3, 'DRAFT', $4, $5, $4)
         RETURNING id, subscription_number AS number, customer_id AS "customerId", plan_id AS "planId", status, starts_on AS "startsOn", expires_on AS "expiresOn", next_billing_on AS "nextBilling"`,
        [number, customerResult.rows[0].id, body.planId, body.startsOn, body.expiresOn ?? null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/dashboard", (_req, res) => {
    const active = subscriptions.filter((s) => s.status === "ACTIVE");
    const mrr = active.reduce((sum, item) => sum + monthlyRecurringRevenue(item.amount, item.interval), 0);
    const open = invoices.filter((i) => i.status !== "Paid");
    res.json({
      metrics: { mrr, activeSubscriptions: active.length, outstanding: open.reduce((sum, i) => sum + i.total, 0), collected: 4879200 },
      trend: [38, 42, 44, 43, 48, 52, 57, 61, 64, 69, 72, 76].map((value, index) => ({ month: ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"][index], value })),
      attention: [{ label: "2 invoices are overdue", tone: "danger" }, { label: "1 subscription is paused", tone: "warning" }, { label: "Billing run ready for 4 November", tone: "info" }]
    });
  });
  app.get("/api/invoices", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json(invoices);
      const isCustomer = req.user?.role === "CUSTOMER";
      const result = await pool.query(
        `SELECT i.id, i.invoice_number AS number, c.legal_name AS customer,
                i.due_on AS "dueDate", i.total_paise AS total, i.status,
                COALESCE(SUM(pa.amount_paise), 0) AS "paidPaise"
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
         ${isCustomer ? "WHERE c.user_id = $1" : ""}
         GROUP BY i.id, c.legal_name ORDER BY i.due_on DESC`,
        isCustomer ? [req.user?.id] : []
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/billing/preview", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const body = z.object({ billingDate: z.string().date() }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `SELECT s.id, s.subscription_number AS subscription, c.legal_name AS customer,
                p.amount_paise AS "subtotalPaise", p.interval,
                CASE WHEN s.status = 'ACTIVE' AND s.next_billing_on <= $1 THEN 'DUE'
                     WHEN s.status <> 'ACTIVE' THEN 'SKIPPED'
                     ELSE 'NOT_DUE' END AS outcome,
                CASE WHEN s.status <> 'ACTIVE' THEN 'Subscription is ' || lower(s.status::text) END AS reason
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
         WHERE s.next_billing_on <= $1 OR s.status <> 'ACTIVE'
         ORDER BY s.next_billing_on`,
        [body.billingDate]
      );
      return res.json({ billingDate: body.billingDate, items: result.rows });
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/billing/run", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    const body = z.object({ billingDate: z.string().date() }).strict().safeParse(req.body);
    if (!body.success) return next(body.error);
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database is not configured" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tally-billing-${body.data.billingDate}`]);
      const run = await client.query(
        "INSERT INTO billing_runs (billing_date, status) VALUES ($1, 'RUNNING') RETURNING id",
        [body.data.billingDate]
      );
      const subscriptionsDue = await client.query(
        `SELECT s.id, s.subscription_number, s.customer_id, s.plan_id, s.next_billing_on,
                p.amount_paise, p.interval
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.status = 'ACTIVE' AND s.next_billing_on <= $1
         FOR UPDATE OF s SKIP LOCKED`,
        [body.data.billingDate]
      );
      let invoiced = 0;
      for (const item of subscriptionsDue.rows as Array<{ id: string; subscription_number: string; customer_id: string; plan_id: string; next_billing_on: string; amount_paise: number; interval: string }>) {
        const periodStart = item.next_billing_on;
        const periodEnd = periodStart;
        const invoice = await client.query(
          `INSERT INTO invoices
            (invoice_number, subscription_id, customer_id, service_period_start, service_period_end,
             status, subtotal_paise, due_on)
           VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6, $4)
           ON CONFLICT (subscription_id, service_period_start, service_period_end) DO NOTHING
           RETURNING id`,
          [`INV-${new Date(body.data.billingDate).getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, item.id, item.customer_id, periodStart, periodEnd, item.amount_paise]
        );
        if (invoice.rowCount) {
          await client.query(
            "INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price_paise) VALUES ($1, $2, 1, $3)",
            [invoice.rows[0].id, `Subscription ${item.subscription_number}`, item.amount_paise]
          );
          await client.query(
            "INSERT INTO billing_run_items (billing_run_id, subscription_id, outcome, invoice_id) VALUES ($1, $2, 'INVOICED', $3)",
            [run.rows[0].id, item.id, invoice.rows[0].id]
          );
          await client.query(
            "UPDATE subscriptions SET next_billing_on = CASE interval WHEN 'daily' THEN next_billing_on + 1 WHEN 'weekly' THEN next_billing_on + 7 WHEN 'monthly' THEN (next_billing_on + interval '1 month')::date WHEN 'yearly' THEN (next_billing_on + interval '1 year')::date END FROM plans WHERE plans.id = subscriptions.plan_id AND subscriptions.id = $1",
            [item.id]
          );
          invoiced++;
        } else {
          await client.query(
            "INSERT INTO billing_run_items (billing_run_id, subscription_id, outcome, reason) VALUES ($1, $2, 'SKIPPED', 'Invoice already exists for billing period')",
            [run.rows[0].id, item.id]
          );
        }
      }
      await client.query("UPDATE billing_runs SET status = 'COMPLETED', completed_at = now() WHERE id = $1", [run.rows[0].id]);
      await client.query("COMMIT");
      return res.status(201).json({ runId: run.rows[0].id, due: subscriptionsDue.rowCount, invoiced });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });
  app.post("/api/payments", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    const body = z.object({
      customerId: z.string().uuid(),
      invoiceId: z.string().uuid(),
      amountPaise: z.number().int().positive(),
      method: z.enum(["cash", "bank_transfer", "upi", "card", "cheque", "other"]),
      reference: z.string().trim().max(120).optional(),
      receivedOn: z.string().date(),
      notes: z.string().max(2000).default("")
    }).strict().safeParse(req.body);
    if (!body.success) return next(body.error);
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database is not configured" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const invoice = await client.query("SELECT customer_id, total_paise FROM invoices WHERE id = $1 FOR UPDATE", [body.data.invoiceId]);
      if (!invoice.rowCount || invoice.rows[0].customer_id !== body.data.customerId) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Invoice not found for customer" });
      }
      const payment = await client.query(
        `INSERT INTO payments (customer_id, amount_paise, method, reference, received_on, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [body.data.customerId, body.data.amountPaise, body.data.method, body.data.reference ?? null, body.data.receivedOn, body.data.notes]
      );
      await client.query(
        "INSERT INTO payment_allocations (payment_id, invoice_id, amount_paise) VALUES ($1, $2, $3)",
        [payment.rows[0].id, body.data.invoiceId, body.data.amountPaise]
      );
      await client.query(
        `UPDATE invoices SET status = 'PAID'
         WHERE id = $1 AND total_paise <= (
           SELECT COALESCE(SUM(amount_paise), 0) FROM payment_allocations WHERE invoice_id = $1
         )`,
        [body.data.invoiceId]
      );
      await client.query("COMMIT");
      return res.status(201).json({ id: payment.rows[0].id, invoiceId: body.data.invoiceId, amountPaise: body.data.amountPaise });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });
  app.get("/api/reports", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (pool) {
        const scope = req.user?.role === "CUSTOMER" ? "WHERE c.user_id = $1" : "";
        const params = req.user?.role === "CUSTOMER" ? [req.user.id] : [];
        const totals = await pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN s.status = 'ACTIVE' THEN
               CASE p.interval WHEN 'daily' THEN p.amount_paise * 365 / 12
               WHEN 'weekly' THEN p.amount_paise * 52 / 12
               WHEN 'yearly' THEN p.amount_paise / 12
               ELSE p.amount_paise END ELSE 0 END), 0)::bigint AS mrr,
             COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int AS active_subscriptions,
             COALESCE((SELECT SUM(i.total_paise) FROM invoices i JOIN customers ic ON ic.id = i.customer_id
               WHERE i.status <> 'PAID' AND ${scope ? "ic.user_id = $1 AND" : ""} i.id IS NOT NULL), 0)::bigint AS outstanding
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN customers c ON c.id = s.customer_id ${scope}`,
          params
        );
        const row = totals.rows[0] as { mrr: number; active_subscriptions: number; outstanding: number };
        return res.json({ mrr: Number(row.mrr), arr: Number(row.mrr) * 12, activeSubscriptions: row.active_subscriptions, outstanding: Number(row.outstanding) });
      }
    } catch (error) {
      return next(error);
    }
    const mrr = subscriptions.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + monthlyRecurringRevenue(s.amount, s.interval), 0);
    return res.json({ mrr, arr: mrr * 12, movements: { opening: 5480000, newBusiness: 820000, expansion: 310000, contraction: 90000, reactivation: 0, churn: 180000, closing: 6340000 }, aging: [{ bucket: "0–30 days", amount: 1762820 }, { bucket: "31–60 days", amount: 825882 }, { bucket: "60+ days", amount: 0 }] });
  });
  app.get("/api/intelligence/anomalies", authenticate, async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT 'DUPLICATE_PAYMENT_REFERENCE' AS rule, p.reference AS record,
                'Payment reference appears more than once for the same customer' AS explanation,
                'MEDIUM' AS severity, 'Review the duplicate bank references' AS action
         FROM payments p
         WHERE p.reference IS NOT NULL
         GROUP BY p.customer_id, p.reference HAVING COUNT(*) > 1
         UNION ALL
         SELECT 'LARGE_INVOICE', i.invoice_number,
                'Invoice is more than three times the average invoice total', 'HIGH',
                'Confirm pricing and service period before collection'
         FROM invoices i
         WHERE i.total_paise > (SELECT COALESCE(AVG(total_paise) * 3, 0) FROM invoices)`,
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/intelligence/leakage", authenticate, requireRole("ADMIN", "STAFF"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ findings: [], estimatedImpactPaise: 0 });
      const result = await pool.query(
        `SELECT s.subscription_number AS subscription, c.legal_name AS customer,
                s.next_billing_on AS "expectedBillingDate", p.amount_paise AS "estimatedImpactPaise",
                'ACTIVE subscription has a billing date in the past' AS reason
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id
         WHERE s.status = 'ACTIVE' AND s.next_billing_on < CURRENT_DATE
           AND NOT EXISTS (
             SELECT 1 FROM invoices i WHERE i.subscription_id = s.id
               AND i.service_period_start = s.next_billing_on
           )
         ORDER BY p.amount_paise DESC`
      );
      return res.json({ findings: result.rows, estimatedImpactPaise: result.rows.reduce((sum: number, row: { estimatedImpactPaise: number }) => sum + Number(row.estimatedImpactPaise), 0) });
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/billing/preview-fixture", (_req, res) => {
    const due = subscriptions.filter((s) => s.status === "ACTIVE" && s.nextBilling <= "2026-11-04");
    res.json({ due: due.map((s) => ({ subscription: s.number, customer: s.customer, amount: calculateInvoiceTotals(s.amount, 0, 0.18).total })), skipped: subscriptions.filter((s) => s.status !== "ACTIVE").map((s) => ({ subscription: s.number, reason: `Subscription is ${s.status.toLowerCase()}` })) });
  });
  app.post("/api/subscriptions/:id/transition", authenticate, (req, res, next) => {
    try {
      const body = z.object({ status: z.enum(["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"]) }).strict().parse(req.body);
      const item = subscriptions.find((s) => s.id === req.params.id);
      if (!item) return res.status(404).json({ error: "Subscription not found" });
      if (!lifecycleTransitions[item.status].includes(body.status as SubscriptionStatus)) return res.status(409).json({ error: `Cannot transition ${item.status} to ${body.status}` });
      item.status = body.status as SubscriptionStatus;
      res.json(item);
    } catch (error) { next(error); }
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.flatten() });
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return res.status(409).json({ error: "A record with the same unique value already exists" });
    }
    if (error instanceof Error && error.message === "Database is not configured") {
      return res.status(503).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
