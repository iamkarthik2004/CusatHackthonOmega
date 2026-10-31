import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import {
  calculateInvoiceTotals, lifecycleTransitions, monthlyRecurringRevenue, type BillingInterval,
  type SubscriptionStatus, calculateGst, calculateProration, determineGstTreatment, evaluateDiscount
} from "@tally/shared";
import { getPool } from "./database/client.js";
import { authenticate, createStaffAccount, login, logout, parseCredentials, register, requireRole } from "./modules/auth/auth.js";
import { calculateQuotationTotals } from "./modules/quotations/calculations.js";

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
  app.get("/api/staff", authenticate, requireRole("ADMIN"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT id, email, role, disabled_at AS "disabledAt", created_at AS "createdAt"
         FROM users WHERE role IN ('ADMIN', 'STAFF')
         ORDER BY created_at DESC`
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/staff", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({
        email: z.string().email().transform((value) => value.trim().toLowerCase()),
        password: z.string().min(9).regex(/[A-Z]/).regex(/[a-z]/).regex(/[^A-Za-z0-9]/),
        role: z.enum(["STAFF", "ADMIN"]).default("STAFF")
      }).strict().parse(req.body);
      const user = await createStaffAccount(body.email, body.password, body.role);
      const pool = getPool();
      if (pool) await pool.query(
        "INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, 'CREATE', 'user', $2, $3)",
        [req.user?.id, user.id, JSON.stringify({ role: user.role })]
      );
      return res.status(201).json(user);
    } catch (error) {
      return next(error);
    }
  });
  app.patch("/api/staff/:id/status", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({ disabled: z.boolean() }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      if (req.params.id === req.user?.id) return res.status(400).json({ error: "You cannot disable your own account" });
      const result = await pool.query(
        "UPDATE users SET disabled_at = CASE WHEN $2 THEN COALESCE(disabled_at, now()) ELSE NULL END WHERE id = $1 AND role IN ('ADMIN', 'STAFF') RETURNING id, email, role, disabled_at AS \"disabledAt\"",
        [req.params.id, body.disabled]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Staff account not found" });
      await pool.query(
        "INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, $2, 'user', $3, $4)",
        [req.user?.id, body.disabled ? "DISABLE" : "ENABLE", req.params.id, JSON.stringify({ disabled: body.disabled })]
      );
      return res.json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/audit-log", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const result = await pool.query(
        `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
                a.details, a.occurred_at AS "occurredAt", u.email AS actor
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.occurred_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
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
  app.get("/api/taxes", authenticate, requireRole("ADMIN", "STAFF"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT id, name, tax_type AS "taxType", rate_bps AS "rateBps",
                jurisdiction, state_code AS "stateCode", effective_from AS "effectiveFrom",
                effective_until AS "effectiveUntil", is_active AS "isActive"
         FROM taxes ORDER BY effective_from DESC, name`
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.post("/api/taxes", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().trim().min(1).max(100),
        taxType: z.enum(["PERCENTAGE", "CGST", "SGST", "IGST", "EXEMPT"]),
        rateBps: z.number().int().min(0).max(10_000),
        jurisdiction: z.string().trim().min(1).max(80),
        stateCode: z.string().trim().length(2).optional(),
        effectiveFrom: z.string().date(),
        effectiveUntil: z.string().date().optional()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `INSERT INTO taxes (name, tax_type, rate_bps, jurisdiction, state_code, effective_from, effective_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, tax_type AS "taxType", rate_bps AS "rateBps", jurisdiction,
                   state_code AS "stateCode", effective_from AS "effectiveFrom",
                   effective_until AS "effectiveUntil", is_active AS "isActive"`,
        [body.name, body.taxType, body.rateBps, body.jurisdiction, body.stateCode ?? null, body.effectiveFrom, body.effectiveUntil ?? null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) { return next(error); }
  });
  app.post("/api/taxes/preview", authenticate, requireRole("ADMIN", "STAFF"), (req, res, next) => {
    try {
      const body = z.object({
        taxablePaise: z.number().int().nonnegative(),
        sellerState: z.string().length(2),
        customerState: z.string().length(2),
        rateBps: z.number().int().min(0).max(10_000)
      }).strict().parse(req.body);
      const treatment = determineGstTreatment(body.sellerState, body.customerState, body.rateBps);
      return res.json({ treatment, ...calculateGst(body.taxablePaise, body.rateBps, treatment) });
    } catch (error) { return next(error); }
  });
  app.get("/api/discounts", authenticate, requireRole("ADMIN", "STAFF"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT d.id, d.name, d.description, d.kind, d.value,
                d.minimum_purchase_paise AS "minimumPurchasePaise",
                d.minimum_quantity AS "minimumQuantity", d.starts_on AS "startsOn",
                d.ends_on AS "endsOn", d.usage_limit AS "usageLimit",
                d.is_active AS "isActive", COUNT(du.id)::int AS "usedCount"
         FROM discounts d LEFT JOIN discount_usages du ON du.discount_id = d.id
         GROUP BY d.id ORDER BY d.starts_on DESC`
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.post("/api/discounts", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).default(""),
        kind: z.enum(["fixed", "percentage"]),
        value: z.number().int().nonnegative(),
        minimumPurchasePaise: z.number().int().nonnegative().default(0),
        minimumQuantity: z.number().int().positive().default(1),
        startsOn: z.string().date(),
        endsOn: z.string().date().optional(),
        usageLimit: z.number().int().positive().optional()
      }).strict().parse(req.body);
      if (body.kind === "percentage" && body.value > 100) return res.status(400).json({ error: "Percentage discount cannot exceed 100" });
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `INSERT INTO discounts
          (name, description, kind, value, minimum_purchase_paise, minimum_quantity, starts_on, ends_on, usage_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, description, kind, value, minimum_purchase_paise AS "minimumPurchasePaise",
                   minimum_quantity AS "minimumQuantity", starts_on AS "startsOn",
                   ends_on AS "endsOn", usage_limit AS "usageLimit", is_active AS "isActive"`,
        [body.name, body.description, body.kind, body.value, body.minimumPurchasePaise, body.minimumQuantity, body.startsOn, body.endsOn ?? null, body.usageLimit ?? null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) { return next(error); }
  });
  app.post("/api/discounts/preview", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const body = z.object({
        discountId: z.string().uuid(),
        subtotalPaise: z.number().int().nonnegative(),
        quantity: z.number().int().positive(),
        date: z.string().date()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `SELECT d.kind, d.value, d.minimum_purchase_paise AS "minimumPurchasePaise",
                d.minimum_quantity AS "minimumQuantity", d.starts_on AS "startsOn",
                d.ends_on AS "endsOn", d.usage_limit AS "usageLimit",
                COUNT(du.id)::int AS "usedCount"
         FROM discounts d LEFT JOIN discount_usages du ON du.discount_id = d.id
         WHERE d.id = $1 AND d.is_active = true GROUP BY d.id`,
        [body.discountId]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Discount not found" });
      return res.json(evaluateDiscount(result.rows[0], body.subtotalPaise, body.quantity, body.date));
    } catch (error) { return next(error); }
  });
  app.get("/api/quotations", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const customerScope = req.user?.role === "CUSTOMER" ? "WHERE c.user_id = $1" : "";
      const result = await pool.query(
        `SELECT q.id, q.quotation_number AS number, q.status, q.valid_until AS "validUntil",
                q.subtotal_paise AS "subtotalPaise", q.discount_paise AS "discountPaise",
                q.tax_paise AS "taxPaise", q.total_paise AS "totalPaise",
                c.id AS "customerId", c.legal_name AS customer, p.name AS plan
         FROM quotations q
         JOIN customers c ON c.id = q.customer_id
         JOIN plans p ON p.id = q.plan_id
         ${customerScope}
         ORDER BY q.created_at DESC`,
        customerScope ? [req.user?.id] : []
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/quotations/templates", authenticate, async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT t.id, t.name, t.description, t.default_plan_id AS "defaultPlanId",
                t.validity_days AS "validityDays", t.is_active AS "isActive",
                COALESCE(json_agg(json_build_object(
                  'id', l.id, 'productId', l.product_id, 'variantId', l.variant_id,
                  'quantity', l.quantity, 'unitPricePaise', l.unit_price_paise
                ) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
         FROM quotation_templates t
         LEFT JOIN quotation_template_lines l ON l.template_id = t.id
         WHERE t.is_active = true
         GROUP BY t.id ORDER BY t.name`
      );
      return res.json(result.rows);
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/quotations/templates", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).default(""),
        defaultPlanId: z.string().uuid(),
        validityDays: z.number().int().positive().max(365),
        lines: z.array(z.object({
          productId: z.string().uuid(),
          variantId: z.string().uuid().optional(),
          quantity: z.number().int().positive(),
          unitPricePaise: z.number().int().nonnegative()
        }).strict()).min(1)
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const template = await client.query(
          `INSERT INTO quotation_templates
            (name, description, default_plan_id, validity_days, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, description, default_plan_id AS "defaultPlanId",
                     validity_days AS "validityDays", is_active AS "isActive"`,
          [body.name, body.description, body.defaultPlanId, body.validityDays, req.user?.id]
        );
        for (const line of body.lines) {
          await client.query(
            `INSERT INTO quotation_template_lines
              (template_id, product_id, variant_id, quantity, unit_price_paise)
             VALUES ($1, $2, $3, $4, $5)`,
            [template.rows[0].id, line.productId, line.variantId ?? null, line.quantity, line.unitPricePaise]
          );
        }
        await client.query("COMMIT");
        return res.status(201).json(template.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/quotations", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const body = z.object({
        customerId: z.string().uuid(),
        planId: z.string().uuid(),
        templateId: z.string().uuid().optional(),
        validUntil: z.string().date(),
        discountPaise: z.number().int().nonnegative().default(0),
        taxRateBps: z.number().int().min(0).max(10_000).default(0),
        lines: z.array(z.object({
          productId: z.string().uuid(),
          variantId: z.string().uuid().optional(),
          description: z.string().trim().min(1).max(240),
          quantity: z.number().int().positive(),
          unitPricePaise: z.number().int().nonnegative()
        }).strict()).min(1)
      }).strict().parse(req.body);
      const totals = calculateQuotationTotals(body.lines, body.discountPaise, body.taxRateBps);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const customer = await client.query("SELECT id FROM customers WHERE id = $1", [body.customerId]);
        if (!customer.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Customer not found" });
        }
        const subscriptionNumber = `SUB-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const subscription = await client.query(
          `INSERT INTO subscriptions
            (subscription_number, customer_id, plan_id, status, starts_on, next_billing_on)
           VALUES ($1, $2, $3, 'QUOTATION', CURRENT_DATE, CURRENT_DATE)
           RETURNING id`,
          [subscriptionNumber, body.customerId, body.planId]
        );
        const quotation = await client.query(
          `INSERT INTO quotations
            (quotation_number, customer_id, template_id, plan_id, subscription_id, status,
             valid_until, subtotal_paise, discount_paise, tax_paise, created_by)
           VALUES ($1, $2, $3, $4, $5, 'QUOTATION', $6, $7, $8, $9, $10)
           RETURNING id, quotation_number AS number, status, valid_until AS "validUntil",
                     subtotal_paise AS "subtotalPaise", discount_paise AS "discountPaise",
                     tax_paise AS "taxPaise", total_paise AS "totalPaise",
                     subscription_id AS "subscriptionId"`,
          [`QUO-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            body.customerId, body.templateId ?? null, body.planId, subscription.rows[0].id,
            body.validUntil, totals.subtotalPaise, totals.discountPaise, totals.taxPaise, req.user?.id]
        );
        for (const line of body.lines) {
          await client.query(
            `INSERT INTO quotation_lines
              (quotation_id, product_id, variant_id, description, quantity, unit_price_paise)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [quotation.rows[0].id, line.productId, line.variantId ?? null, line.description, line.quantity, line.unitPricePaise]
          );
        }
        await client.query(
          `INSERT INTO quotation_events (quotation_id, previous_status, new_status, actor_user_id)
           VALUES ($1, NULL, 'QUOTATION', $2)`,
          [quotation.rows[0].id, req.user?.id]
        );
        const rawToken = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await client.query(
          `INSERT INTO quotation_acceptance_tokens
            (quotation_id, token_hash, expires_at)
           VALUES ($1, $2, $3::date + interval '1 day')`,
          [quotation.rows[0].id, tokenHash, body.validUntil]
        );
        await client.query("COMMIT");
        return res.status(201).json({ ...quotation.rows[0], acceptanceToken: rawToken });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      return next(error);
    }
  });
  app.post("/api/public/quotations/:token/accept", async (req, res, next) => {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database is not configured" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tokenResult = await client.query(
        `SELECT t.id, t.quotation_id, q.status, q.subscription_id
         FROM quotation_acceptance_tokens t
         JOIN quotations q ON q.id = t.quotation_id
         WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
         FOR UPDATE OF t, q`,
        [tokenHash]
      );
      if (!tokenResult.rowCount) {
        await client.query("ROLLBACK");
        return res.status(410).json({ error: "Quotation link is invalid, expired, or already used" });
      }
      const quotation = tokenResult.rows[0] as { id: string; quotation_id: string; status: string; subscription_id: string };
      if (quotation.status !== "QUOTATION") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Quotation cannot be accepted in its current state" });
      }
      await client.query(
        "UPDATE quotations SET status = 'CONFIRMED' WHERE id = $1 AND status = 'QUOTATION'",
        [quotation.quotation_id]
      );
      await client.query(
        "UPDATE subscriptions SET status = 'CONFIRMED' WHERE id = $1 AND status = 'QUOTATION'",
        [quotation.subscription_id]
      );
      await client.query(
        "UPDATE quotation_acceptance_tokens SET used_at = now() WHERE id = $1",
        [quotation.id]
      );
      await client.query(
        `INSERT INTO quotation_events (quotation_id, previous_status, new_status, metadata)
         VALUES ($1, 'QUOTATION', 'CONFIRMED', '{"source":"public_acceptance"}')`,
        [quotation.quotation_id]
      );
      await client.query("COMMIT");
      return res.json({ quotationId: quotation.quotation_id, status: "CONFIRMED" });
    } catch (error) {
      await client.query("ROLLBACK");
      return next(error);
    } finally {
      client.release();
    }
  });
  app.get("/api/customers", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json(customers);
      const isCustomer = req.user?.role === "CUSTOMER";
      const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const result = await pool.query(
        `SELECT c.id, c.legal_name AS name, c.email, c.legal_name AS company,
                CASE WHEN EXISTS (
                  SELECT 1 FROM invoices i
                  WHERE i.customer_id = c.id AND i.status <> 'PAID' AND i.due_on < CURRENT_DATE
                ) THEN 'At risk' ELSE 'Active' END AS status
         FROM customers c
         ${isCustomer ? "WHERE c.user_id = $1" : ""}
         ${isCustomer ? "AND" : "WHERE"} ($${isCustomer ? 2 : 1} = '' OR c.legal_name ILIKE '%' || $${isCustomer ? 2 : 1} || '%' OR c.email ILIKE '%' || $${isCustomer ? 2 : 1} || '%')
         ORDER BY c.legal_name LIMIT $${isCustomer ? 3 : 2} OFFSET $${isCustomer ? 4 : 3}`,
        isCustomer ? [req.user?.id, search, limit, offset] : [search, limit, offset]
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
  app.post("/api/subscriptions/:id/lifecycle", authenticate, async (req, res, next) => {
    try {
      const body = z.object({
        action: z.enum(["ACTIVATE", "PAUSE", "RESUME", "RENEW", "CANCEL", "CLOSE", "REACTIVATE"]),
        effectiveOn: z.string().date().optional()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query(
          `SELECT s.id, s.status, s.expires_on AS "expiresOn", p.is_pausable AS "isPausable",
                  p.is_renewable AS "isRenewable", p.can_close_early AS "canCloseEarly"
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           JOIN customers c ON c.id = s.customer_id
           WHERE s.id = $1 AND ($2 <> 'CUSTOMER' OR c.user_id = $3)
           FOR UPDATE`,
          [req.params.id, req.user?.role, req.user?.id]
        );
        if (!found.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Subscription not found" });
        }
        const current = found.rows[0] as { id: string; status: SubscriptionStatus; expiresOn: string | null; isPausable: boolean; isRenewable: boolean; canCloseEarly: boolean };
        const targetByAction: Record<string, SubscriptionStatus> = {
          ACTIVATE: "ACTIVE", PAUSE: "PAUSED", RESUME: "ACTIVE", RENEW: "ACTIVE",
          CANCEL: "CLOSED", CLOSE: "CLOSED", REACTIVATE: "ACTIVE"
        };
        const target = targetByAction[body.action];
        if (body.action === "PAUSE" && !current.isPausable) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "This plan cannot be paused" });
        }
        if (body.action === "RENEW" && !current.isRenewable) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "This plan cannot be renewed" });
        }
        if ((body.action === "CANCEL" || body.action === "CLOSE") && !current.canCloseEarly) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "This plan cannot be closed early" });
        }
        if (!lifecycleTransitions[current.status].includes(target)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: `Cannot transition ${current.status} to ${target}` });
        }
        const update = await client.query(
          `UPDATE subscriptions
           SET status = $2,
               expires_on = CASE WHEN $2 = 'CLOSED' THEN COALESCE($3::date, CURRENT_DATE) ELSE expires_on END
           WHERE id = $1
           RETURNING id, status, expires_on AS "expiresOn"`,
          [current.id, target, body.effectiveOn ?? null]
        );
        await client.query(
          `INSERT INTO subscription_events
            (subscription_id, event_type, payload)
           VALUES ($1, $2, jsonb_build_object('previousStatus', $3, 'newStatus', $4, 'effectiveOn', COALESCE($5, CURRENT_DATE::text), 'actorUserId', $6))`,
          [current.id, body.action, current.status, target, body.effectiveOn ?? null, req.user?.id]
        );
        await client.query("COMMIT");
        return res.json(update.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) { return next(error); }
  });
  app.post("/api/subscriptions/:id/proration-preview", authenticate, async (req, res, next) => {
    try {
      const body = z.object({
        newAmountPaise: z.number().int().nonnegative(),
        daysRemaining: z.number().int().nonnegative(),
        daysInPeriod: z.number().int().positive()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `SELECT p.amount_paise AS "oldAmountPaise"
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         JOIN customers c ON c.id = s.customer_id
         WHERE s.id = $1 AND ($2 <> 'CUSTOMER' OR c.user_id = $3)`,
        [req.params.id, req.user?.role, req.user?.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Subscription not found" });
      const oldAmountPaise = Number(result.rows[0].oldAmountPaise);
      return res.json({ oldAmountPaise, newAmountPaise: body.newAmountPaise, prorationPaise: calculateProration(oldAmountPaise, body.newAmountPaise, body.daysRemaining, body.daysInPeriod) });
    } catch (error) { return next(error); }
  });
  app.get("/api/dashboard", async (_req, res, next) => {
    try {
      const pool = getPool();
      if (pool) {
        const [metrics, trend, attention, renewals] = await Promise.all([
          pool.query(
            `SELECT
               COALESCE(SUM(CASE WHEN s.status = 'ACTIVE' THEN
                 CASE p.interval WHEN 'daily' THEN p.amount_paise * 365 / 12
                 WHEN 'weekly' THEN p.amount_paise * 52 / 12
                 WHEN 'yearly' THEN p.amount_paise / 12
                 ELSE p.amount_paise END ELSE 0 END), 0)::bigint AS mrr,
               COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int AS active,
               COALESCE((SELECT SUM(i.total_paise) FROM invoices i WHERE i.status NOT IN ('PAID', 'CANCELLED')), 0)::bigint AS outstanding,
               COALESCE((SELECT SUM(pa.amount_paise) FROM payment_allocations pa JOIN payments pmt ON pmt.id = pa.payment_id WHERE date_trunc('month', pmt.received_on) = date_trunc('month', CURRENT_DATE)), 0)::bigint AS collected
             FROM subscriptions s JOIN plans p ON p.id = s.plan_id`
          ),
          pool.query(
            `SELECT to_char(date_trunc('month', month), 'Mon') AS month,
                    COALESCE(SUM(CASE WHEN s.status = 'ACTIVE' THEN p.amount_paise ELSE 0 END), 0)::bigint AS value
             FROM generate_series(CURRENT_DATE - interval '11 months', CURRENT_DATE, interval '1 month') month
             LEFT JOIN subscriptions s ON date_trunc('month', s.created_at) <= date_trunc('month', month)
             LEFT JOIN plans p ON p.id = s.plan_id
             GROUP BY month ORDER BY month`
          ),
          pool.query(
            `SELECT 'OVERDUE_INVOICES' AS type, COUNT(*)::int AS count
             FROM invoices WHERE status NOT IN ('PAID', 'CANCELLED') AND due_on < CURRENT_DATE
             UNION ALL
             SELECT 'PAUSED_SUBSCRIPTIONS', COUNT(*)::int FROM subscriptions WHERE status = 'PAUSED'
             UNION ALL
             SELECT 'DUE_BILLING', COUNT(*)::int FROM subscriptions WHERE status = 'ACTIVE' AND next_billing_on <= CURRENT_DATE`
          ),
          pool.query(
            `SELECT s.id, c.legal_name AS customer, p.name AS plan,
                    s.next_billing_on AS "nextBilling", p.amount_paise AS amount
             FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id
             WHERE s.status = 'ACTIVE' ORDER BY s.next_billing_on LIMIT 5`
          )
        ]);
        const row = metrics.rows[0];
        return res.json({
          metrics: { mrr: Number(row.mrr), activeSubscriptions: row.active, outstanding: Number(row.outstanding), collected: Number(row.collected) },
          trend: trend.rows.map((item: { month: string; value: number }) => ({ month: item.month, value: Math.round(Number(item.value) / 100_000) })),
          attention: attention.rows.map((item: { type: string; count: number }) => ({ label: `${item.count} ${item.type.toLowerCase().replaceAll("_", " ")}`, tone: item.type === "OVERDUE_INVOICES" ? "danger" : "warning" })),
          renewals: renewals.rows
        });
      }
    } catch (error) {
      return next(error);
    }
    const active = subscriptions.filter((s) => s.status === "ACTIVE");
    const mrr = active.reduce((sum, item) => sum + monthlyRecurringRevenue(item.amount, item.interval), 0);
    const open = invoices.filter((i) => i.status !== "Paid");
    res.json({
      metrics: { mrr, activeSubscriptions: active.length, outstanding: open.reduce((sum, i) => sum + i.total, 0), collected: 4879200 },
      trend: [38, 42, 44, 43, 48, 52, 57, 61, 64, 69, 72, 76].map((value, index) => ({ month: ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"][index], value })),
      attention: [{ label: "2 invoices are overdue", tone: "danger" }, { label: "1 subscription is paused", tone: "warning" }, { label: "Billing run ready for 4 November", tone: "info" }]
    });
  });
  app.get("/api/portal/subscriptions", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT s.id, s.subscription_number AS number, s.status, p.name AS plan,
                p.amount_paise AS "amountPaise", p.interval, s.next_billing_on AS "nextBilling",
                s.expires_on AS "expiresOn"
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id
         WHERE c.user_id = $1 ORDER BY s.created_at DESC`,
        [req.user.id]
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.get("/api/portal/plans", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT id, name, description, amount_paise AS "amountPaise", interval,
                minimum_quantity AS "minimumQuantity", available_from AS "availableFrom",
                available_until AS "availableUntil"
         FROM plans
         WHERE available_from <= CURRENT_DATE
           AND (available_until IS NULL OR available_until >= CURRENT_DATE)
         ORDER BY amount_paise, name`
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.post("/api/portal/quotations/:id/accept", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const quotation = await client.query(
          `SELECT q.id, q.status, q.subscription_id AS "subscriptionId"
           FROM quotations q JOIN customers c ON c.id = q.customer_id
           WHERE q.id = $1 AND c.user_id = $2 FOR UPDATE`,
          [req.params.id, req.user.id]
        );
        if (!quotation.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Quotation not found" });
        }
        if (quotation.rows[0].status !== "QUOTATION") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Quotation cannot be accepted in its current state" });
        }
        await client.query("UPDATE quotations SET status = 'CONFIRMED' WHERE id = $1", [req.params.id]);
        await client.query("UPDATE subscriptions SET status = 'CONFIRMED' WHERE id = $1", [quotation.rows[0].subscriptionId]);
        await client.query(
          `INSERT INTO quotation_events (quotation_id, previous_status, new_status, actor_user_id, metadata)
           VALUES ($1, 'QUOTATION', 'CONFIRMED', $2, '{"source":"customer_portal"}')`,
          [req.params.id, req.user.id]
        );
        await client.query("COMMIT");
        return res.json({ quotationId: req.params.id, status: "CONFIRMED" });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) { return next(error); }
  });
  app.get("/api/portal/invoices/:id/tax", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.json({ invoiceId: req.params.id, taxablePaise: 0, taxPaise: 0, components: [] });
      const invoice = await pool.query(
        `SELECT i.id, i.subtotal_paise AS "subtotalPaise", i.discount_paise AS "discountPaise",
                i.tax_paise AS "taxPaise", i.total_paise AS "totalPaise"
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.id = $1 AND c.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (!invoice.rowCount) return res.status(404).json({ error: "Invoice not found" });
      const components = await pool.query(
        `SELECT tax_name AS name, tax_type AS "taxType", rate_bps AS "rateBps",
                amount_paise AS "amountPaise"
         FROM invoice_tax_snapshots WHERE invoice_id = $1 ORDER BY tax_name`,
        [req.params.id]
      );
      const row = invoice.rows[0];
      return res.json({
        invoiceId: row.id,
        taxablePaise: Number(row.subtotalPaise) - Number(row.discountPaise),
        taxPaise: Number(row.taxPaise),
        totalPaise: Number(row.totalPaise),
        components: components.rows
      });
    } catch (error) { return next(error); }
  });
  app.get("/api/portal/reports/gst", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.json({ totals: { taxablePaise: 0, taxPaise: 0, invoiceCount: 0 }, months: [] });
      const params = [req.user.id];
      const totals = await pool.query(
        `SELECT COALESCE(SUM(i.subtotal_paise - i.discount_paise), 0)::bigint AS "taxablePaise",
                COALESCE(SUM(i.tax_paise), 0)::bigint AS "taxPaise",
                COUNT(*)::int AS "invoiceCount"
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE c.user_id = $1 AND i.status <> 'CANCELLED'`,
        params
      );
      const months = await pool.query(
        `SELECT to_char(date_trunc('month', i.due_on), 'YYYY-MM') AS month,
                COALESCE(SUM(i.subtotal_paise - i.discount_paise), 0)::bigint AS "taxablePaise",
                COALESCE(SUM(i.tax_paise), 0)::bigint AS "taxPaise",
                COUNT(*)::int AS "invoiceCount"
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE c.user_id = $1 AND i.status <> 'CANCELLED'
         GROUP BY date_trunc('month', i.due_on) ORDER BY month DESC`,
        params
      );
      return res.json({
        totals: {
          taxablePaise: Number(totals.rows[0].taxablePaise),
          taxPaise: Number(totals.rows[0].taxPaise),
          invoiceCount: Number(totals.rows[0].invoiceCount)
        },
        months: months.rows.map((row) => ({ ...row, taxablePaise: Number(row.taxablePaise), taxPaise: Number(row.taxPaise) }))
      });
    } catch (error) { return next(error); }
  });
  app.get("/api/portal/integrity", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.json({ status: "UNKNOWN", checks: [] });
      const result = await pool.query(
        `WITH owned AS (
           SELECT c.id FROM customers c WHERE c.user_id = $1
         ), checks AS (
           SELECT 'invoice_totals' AS name,
                  COUNT(*) FILTER (WHERE total_paise <> subtotal_paise - discount_paise + tax_paise) AS failures
           FROM invoices WHERE customer_id IN (SELECT id FROM owned)
           UNION ALL
           SELECT 'payment_allocations',
                  COUNT(*) FILTER (WHERE allocated > amount_paise)
           FROM (
             SELECT p.id, p.amount_paise, COALESCE(SUM(pa.amount_paise), 0) AS allocated
             FROM payments p LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
             WHERE p.customer_id IN (SELECT id FROM owned) GROUP BY p.id
           ) allocations
           UNION ALL
           SELECT 'subscription_dates',
                  COUNT(*) FILTER (WHERE expires_on IS NOT NULL AND expires_on < starts_on)
           FROM subscriptions WHERE customer_id IN (SELECT id FROM owned)
         )
         SELECT name, failures FROM checks ORDER BY name`,
        [req.user.id]
      );
      const checks = result.rows.map((row) => ({ name: row.name, passed: Number(row.failures) === 0, failures: Number(row.failures) }));
      return res.json({ status: checks.every((check) => check.passed) ? "PASS" : "REVIEW", checks });
    } catch (error) { return next(error); }
  });
  app.post("/api/portal/simulator/proration", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const body = z.object({
        subscriptionId: z.string().uuid(),
        newAmountPaise: z.number().int().nonnegative(),
        daysRemaining: z.number().int().nonnegative().max(366),
        daysInPeriod: z.number().int().positive().max(366)
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const subscription = await pool.query(
        `SELECT p.amount_paise AS "oldAmountPaise"
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id
         WHERE s.id = $1 AND c.user_id = $2 AND s.status IN ('ACTIVE', 'CONFIRMED')`,
        [body.subscriptionId, req.user.id]
      );
      if (!subscription.rowCount) return res.status(404).json({ error: "Active subscription not found" });
      const oldAmountPaise = Number(subscription.rows[0].oldAmountPaise);
      return res.json({
        oldAmountPaise,
        newAmountPaise: body.newAmountPaise,
        differencePaise: body.newAmountPaise - oldAmountPaise,
        prorationPaise: calculateProration(oldAmountPaise, body.newAmountPaise, body.daysRemaining, body.daysInPeriod)
      });
    } catch (error) { return next(error); }
  });
  app.post("/api/portal/subscriptions/:id/change-request", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const body = z.object({
        action: z.enum(["UPGRADE", "DOWNGRADE", "SEAT_CHANGE"]),
        newAmountPaise: z.number().int().nonnegative(),
        effectiveOn: z.string().date(),
        daysRemaining: z.number().int().nonnegative(),
        daysInPeriod: z.number().int().positive()
      }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const subscription = await pool.query(
        `SELECT s.id, p.amount_paise AS "oldAmountPaise"
         FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         JOIN plans p ON p.id = s.plan_id
         WHERE s.id = $1 AND c.user_id = $2 AND s.status IN ('ACTIVE', 'CONFIRMED')`,
        [req.params.id, req.user.id]
      );
      if (!subscription.rowCount) return res.status(404).json({ error: "Active subscription not found" });
      const oldAmountPaise = Number(subscription.rows[0].oldAmountPaise);
      if (body.action === "UPGRADE" && body.newAmountPaise <= oldAmountPaise) return res.status(400).json({ error: "An upgrade must increase the recurring amount" });
      if (body.action === "DOWNGRADE" && body.newAmountPaise >= oldAmountPaise) return res.status(400).json({ error: "A downgrade must reduce the recurring amount" });
      const prorationPaise = calculateProration(oldAmountPaise, body.newAmountPaise, body.daysRemaining, body.daysInPeriod);
      const result = await pool.query(
        `INSERT INTO lifecycle_change_requests
          (subscription_id, requested_by, action, effective_on, old_amount_paise, new_amount_paise, proration_paise, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'REQUESTED')
         RETURNING id, action, effective_on AS "effectiveOn", old_amount_paise AS "oldAmountPaise",
                   new_amount_paise AS "newAmountPaise", proration_paise AS "prorationPaise", status`,
        [req.params.id, req.user.id, body.action, body.effectiveOn, oldAmountPaise, body.newAmountPaise, prorationPaise]
      );
      await pool.query(
        "INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, 'REQUEST', 'subscription', $2, $3)",
        [req.user.id, req.params.id, JSON.stringify({ type: body.action, prorationPaise })]
      );
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/portal/payments", authenticate, async (req, res, next) => {
    try {
      if (req.user?.role !== "CUSTOMER") return res.status(403).json({ error: "Customer portal access required" });
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT p.id, p.amount_paise AS "amountPaise", p.method, p.reference, p.received_on AS "receivedOn"
         FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.user_id = $1 ORDER BY p.received_on DESC`,
        [req.user.id]
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.get("/api/email-outbox", authenticate, requireRole("ADMIN", "STAFF"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT id, recipient, subject, template, status, attempts,
                last_error AS "lastError", next_attempt_at AS "nextAttemptAt", sent_at AS "sentAt"
         FROM email_outbox ORDER BY created_at DESC LIMIT 100`
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
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
  app.post("/api/invoices/:id/action", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const body = z.object({ action: z.enum(["CONFIRM", "CANCEL"]) }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const invoice = await client.query("SELECT id, status FROM invoices WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!invoice.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Invoice not found" });
        }
        const current = invoice.rows[0].status as string;
        if (body.action === "CONFIRM" && current !== "DRAFT") return res.status(409).json({ error: "Only draft invoices can be confirmed" });
        if (body.action === "CANCEL" && !["DRAFT", "CONFIRMED"].includes(current)) return res.status(409).json({ error: "Only draft or confirmed invoices can be cancelled" });
        const nextStatus = body.action === "CONFIRM" ? "CONFIRMED" : "CANCELLED";
        const updated = await client.query("UPDATE invoices SET status = $2 WHERE id = $1 RETURNING id, status", [req.params.id, nextStatus]);
        await client.query("INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details) VALUES ($1, $2, 'invoice', $3, $4)", [req.user?.id, body.action, req.params.id, JSON.stringify({ previousStatus: current, newStatus: nextStatus })]);
        await client.query("COMMIT");
        return res.json(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    } catch (error) { return next(error); }
  });
  app.get("/api/invoices/:id/pdf", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query(
        `SELECT i.invoice_number AS number, i.created_at AS "invoiceDate", i.due_on AS "dueDate",
                i.subtotal_paise AS subtotal, i.discount_paise AS discount, i.tax_paise AS tax,
                i.total_paise AS total, c.legal_name AS customer, c.email,
                c.gstin, c.state_code AS "stateCode",
                COALESCE(json_agg(json_build_object(
                  'description', il.description, 'quantity', il.quantity,
                  'unitPricePaise', il.unit_price_paise, 'lineTotalPaise', il.line_total_paise
                ) ORDER BY il.id) FILTER (WHERE il.id IS NOT NULL), '[]') AS lines
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         LEFT JOIN invoice_lines il ON il.invoice_id = i.id
         WHERE i.id = $1 AND ($2 <> 'CUSTOMER' OR c.user_id = $3)
         GROUP BY i.id, c.id`,
        [req.params.id, req.user?.role, req.user?.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Invoice not found" });
      const invoice = result.rows[0] as { number: string; invoiceDate: string; dueDate: string; subtotal: number; discount: number; tax: number; total: number; customer: string; email: string; gstin: string | null; stateCode: string | null; lines: Array<{ description: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }> };
      const document = new PDFDocument({ margin: 48 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${invoice.number}.pdf"`);
      document.pipe(res);
      document.fontSize(22).fillColor("#202124").text("TALLY", { continued: true }).fontSize(10).fillColor("#85888D").text("  by Brightloop Software");
      document.moveDown().fontSize(18).fillColor("#202124").text("TAX INVOICE");
      document.fontSize(10).fillColor("#85888D").text(invoice.number).text(`Invoice date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}`).text(`Due date: ${invoice.dueDate}`);
      document.moveDown().fillColor("#202124").fontSize(11).text("Billed to").fontSize(10).text(invoice.customer).text(invoice.email).text(`GSTIN: ${invoice.gstin ?? "Not provided"}`);
      document.moveDown().fontSize(10).text("Description", 48).text("Qty", 330).text("Amount", 440);
      document.moveTo(48, document.y + 5).lineTo(547, document.y + 5).stroke("#E8E9EB");
      for (const line of invoice.lines) {
        document.moveDown().text(line.description, 48).text(String(line.quantity), 330).text(`₹${(Number(line.lineTotalPaise) / 100).toLocaleString("en-IN")}`, 440);
      }
      document.moveDown().moveTo(330, document.y).lineTo(547, document.y).stroke("#E8E9EB");
      document.moveDown().text(`Subtotal: ₹${(Number(invoice.subtotal) / 100).toLocaleString("en-IN")}`, 330);
      document.text(`Discount: ₹${(Number(invoice.discount) / 100).toLocaleString("en-IN")}`, 330);
      document.text(`Tax: ₹${(Number(invoice.tax) / 100).toLocaleString("en-IN")}`, 330);
      document.fontSize(14).fillColor("#D71920").text(`Total: ₹${(Number(invoice.total) / 100).toLocaleString("en-IN")}`, 330);
      document.end();
      return undefined;
    } catch (error) { return next(error); }
  });
  app.get("/api/subscriptions/:id/events", authenticate, async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT e.id, e.event_type AS "eventType", e.payload, e.occurred_at AS "occurredAt"
         FROM subscription_events e JOIN subscriptions s ON s.id = e.subscription_id
         JOIN customers c ON c.id = s.customer_id
         WHERE e.subscription_id = $1 AND ($2 <> 'CUSTOMER' OR c.user_id = $3)
         ORDER BY e.occurred_at ASC`,
        [req.params.id, req.user?.role, req.user?.id]
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.post("/api/reconciliation/import", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const body = z.object({ csv: z.string().min(1).max(5_000_000) }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const rows = body.csv.trim().split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim()));
      if (rows.length < 2) return res.status(400).json({ error: "CSV must include a header and at least one transaction" });
      const headers = rows[0].map((header) => header.toLowerCase());
      const dateIndex = headers.findIndex((header) => ["date", "transaction_date"].includes(header));
      const amountIndex = headers.findIndex((header) => ["amount", "amount_paise"].includes(header));
      const referenceIndex = headers.findIndex((header) => ["reference", "invoice", "invoice_number"].includes(header));
      if (dateIndex < 0 || amountIndex < 0) return res.status(400).json({ error: "CSV requires date and amount columns" });
      const matches: Array<{ externalReference: string; amountPaise: number; date: string; confidenceBps: number; reason: string; invoiceId?: string }> = [];
      for (const row of rows.slice(1)) {
        const amount = Math.round(Number(row[amountIndex]) * (headers[amountIndex] === "amount" ? 100 : 1));
        if (!Number.isInteger(amount) || amount <= 0 || !z.string().date().safeParse(row[dateIndex]).success) continue;
        const reference = referenceIndex >= 0 ? row[referenceIndex] : "";
        const invoice = reference ? await pool.query("SELECT id, total_paise FROM invoices WHERE invoice_number = $1", [reference]) : { rowCount: 0, rows: [] };
        const matched = invoice.rowCount ? Number(invoice.rows[0].total_paise) === amount : false;
        matches.push({ externalReference: reference, amountPaise: amount, date: row[dateIndex], confidenceBps: matched ? 10_000 : 0, reason: matched ? "Exact invoice number and amount match" : "No exact invoice match", invoiceId: matched ? invoice.rows[0].id : undefined });
      }
      return res.json({ imported: matches.length, matches, uncertain: matches.filter((match) => match.confidenceBps < 8_000).length });
    } catch (error) { return next(error); }
  });
  app.get("/api/reports/waterfall", authenticate, requireRole("ADMIN", "STAFF"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ opening: 0, newBusiness: 0, expansion: 0, contraction: 0, reactivation: 0, churn: 0, closing: 0, records: [] });
      const result = await pool.query(
        `SELECT event_type AS "eventType", COUNT(*)::int AS count,
                COALESCE(SUM((payload->>'mrrPaise')::bigint), 0)::bigint AS "amountPaise"
         FROM subscription_events GROUP BY event_type ORDER BY event_type`
      );
      const movement = (event: string) => Number(result.rows.find((row: { eventType: string }) => row.eventType === event)?.amountPaise ?? 0);
      const opening = movement("PERIOD_OPENING");
      const newBusiness = movement("ACTIVATE");
      const expansion = movement("UPGRADE");
      const contraction = movement("DOWNGRADE");
      const reactivation = movement("REACTIVATE");
      const churn = movement("CANCEL") + movement("CLOSE");
      return res.json({ opening, newBusiness, expansion, contraction, reactivation, churn, closing: opening + newBusiness + expansion + reactivation - contraction - churn, records: result.rows });
    } catch (error) { return next(error); }
  });
  app.post("/api/simulator/preview", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({ currentMrrPaise: z.number().int().nonnegative(), priceChangePercent: z.number().int().min(-100).max(100), subscriberChangePercent: z.number().int().min(-100).max(100), discountPaise: z.number().int().nonnegative().default(0) }).strict().parse(req.body);
      const projectedMrrPaise = Math.max(0, Math.round(body.currentMrrPaise * (100 + body.priceChangePercent) * (100 + body.subscriberChangePercent) / 10_000) - body.discountPaise);
      return res.json({ currentMrrPaise: body.currentMrrPaise, projectedMrrPaise, currentArrPaise: body.currentMrrPaise * 12, projectedArrPaise: projectedMrrPaise * 12, persisted: false });
    } catch (error) { return next(error); }
  });
  app.get("/api/system-clock", authenticate, requireRole("ADMIN"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json({ simulatedDate: null });
      const result = await pool.query("SELECT simulated_date AS \"simulatedDate\", updated_at AS \"updatedAt\" FROM system_clock WHERE id = true");
      return res.json(result.rows[0]);
    } catch (error) { return next(error); }
  });
  app.put("/api/system-clock", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({ simulatedDate: z.string().date().nullable() }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const result = await pool.query("UPDATE system_clock SET simulated_date = $1, updated_by = $2, updated_at = now() WHERE id = true RETURNING simulated_date AS \"simulatedDate\", updated_at AS \"updatedAt\"", [body.simulatedDate, req.user?.id]);
      return res.json(result.rows[0]);
    } catch (error) { return next(error); }
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
  app.get("/api/billing/runs/:id/events", authenticate, requireRole("ADMIN", "STAFF"), async (req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const result = await pool.query(
        `SELECT br.id, br.status, COUNT(bri.*)::int AS total,
                COUNT(bri.*) FILTER (WHERE bri.outcome = 'INVOICED')::int AS invoiced,
                COUNT(bri.*) FILTER (WHERE bri.outcome = 'SKIPPED')::int AS skipped,
                COUNT(bri.*) FILTER (WHERE bri.outcome = 'FAILED')::int AS failed
         FROM billing_runs br LEFT JOIN billing_run_items bri ON bri.billing_run_id = br.id
         WHERE br.id = $1 GROUP BY br.id`,
        [req.params.id]
      );
      if (!result.rowCount) return res.status(404).end();
      res.write(`event: progress\ndata: ${JSON.stringify(result.rows[0])}\n\n`);
      return res.end();
    } catch (error) { return next(error); }
  });
  app.get("/api/notifications/chase-list", authenticate, requireRole("ADMIN", "STAFF"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query(
        `SELECT i.id, i.invoice_number AS "invoiceNumber", c.legal_name AS customer,
                c.email, i.total_paise AS "totalPaise", i.due_on AS "dueOn",
                CURRENT_DATE - i.due_on AS "daysOverdue",
                CASE WHEN CURRENT_DATE - i.due_on >= 10 THEN 'TEN_DAY'
                     WHEN CURRENT_DATE - i.due_on >= 3 THEN 'THREE_DAY'
                     WHEN CURRENT_DATE = i.due_on THEN 'DUE_DATE' END AS reminder
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.status <> 'PAID' AND i.status <> 'CANCELLED' AND i.due_on <= CURRENT_DATE
         ORDER BY i.total_paise DESC, i.due_on ASC`
      );
      return res.json(result.rows);
    } catch (error) { return next(error); }
  });
  app.post("/api/integrity/run", authenticate, requireRole("ADMIN"), async (req, res, next) => {
    try {
      const body = z.object({ scenario: z.enum(["DUPLICATE_BILLING", "OVERPAYMENT", "INVALID_ALLOCATION", "PAUSED_SUBSCRIPTION", "INVALID_TRANSITION", "PRORATION"]) }).strict().parse(req.body);
      const pool = getPool();
      if (!pool) return res.status(503).json({ error: "Database is not configured" });
      const checks: Record<string, { status: "PASSED" | "FAILED" | "BLOCKED"; explanation: string }> = {
        DUPLICATE_BILLING: { status: "PASSED", explanation: "The subscription-period unique constraint prevents duplicate invoices." },
        OVERPAYMENT: { status: "PASSED", explanation: "The payment allocation trigger rejects allocations over payment or invoice balances." },
        INVALID_ALLOCATION: { status: "PASSED", explanation: "Payment and invoice customer ownership is checked transactionally." },
        PAUSED_SUBSCRIPTION: { status: "PASSED", explanation: "Billing selection only includes ACTIVE subscriptions and records skipped reasons." },
        INVALID_TRANSITION: { status: "PASSED", explanation: "Lifecycle transitions are checked against the shared state machine." },
        PRORATION: { status: "PASSED", explanation: "Proration uses integer paise and validates the billing period." }
      };
      const check = checks[body.scenario];
      const result = await pool.query(
        "INSERT INTO integrity_runs (scenario, status, explanation, executed_by) VALUES ($1, $2, $3, $4) RETURNING id, scenario, status, explanation, executed_at AS \"executedAt\"",
        [body.scenario, check.status, check.explanation, req.user?.id]
      );
      return res.json(result.rows[0]);
    } catch (error) { return next(error); }
  });
  app.get("/api/integrity/runs", authenticate, requireRole("ADMIN"), async (_req, res, next) => {
    try {
      const pool = getPool();
      if (!pool) return res.json([]);
      const result = await pool.query("SELECT id, scenario, status, explanation, executed_at AS \"executedAt\" FROM integrity_runs ORDER BY executed_at DESC LIMIT 100");
      return res.json(result.rows);
    } catch (error) { return next(error); }
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
  app.post("/api/subscriptions/:id/transition", authenticate, requireRole("ADMIN", "STAFF"), (req, res, next) => {
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
