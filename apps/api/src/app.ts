import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import {
  calculateInvoiceTotals, lifecycleTransitions, monthlyRecurringRevenue, type BillingInterval,
  type SubscriptionStatus
} from "@tally/shared";

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
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "tally-api" }));
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
  app.get("/api/customers", (_req, res) => res.json(customers));
  app.get("/api/subscriptions", (_req, res) => res.json(subscriptions));
  app.get("/api/invoices", (_req, res) => res.json(invoices));
  app.get("/api/reports", (_req, res) => {
    const mrr = subscriptions.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + monthlyRecurringRevenue(s.amount, s.interval), 0);
    res.json({ mrr, arr: mrr * 12, movements: { opening: 5480000, newBusiness: 820000, expansion: 310000, contraction: 90000, reactivation: 0, churn: 180000, closing: 6340000 }, aging: [{ bucket: "0–30 days", amount: 1762820 }, { bucket: "31–60 days", amount: 825882 }, { bucket: "60+ days", amount: 0 }] });
  });
  app.post("/api/billing/preview", (_req, res) => {
    const due = subscriptions.filter((s) => s.status === "ACTIVE" && s.nextBilling <= "2026-11-04");
    res.json({ due: due.map((s) => ({ subscription: s.number, customer: s.customer, amount: calculateInvoiceTotals(s.amount, 0, 0.18).total })), skipped: subscriptions.filter((s) => s.status !== "ACTIVE").map((s) => ({ subscription: s.number, reason: `Subscription is ${s.status.toLowerCase()}` })) });
  });
  app.post("/api/subscriptions/:id/transition", (req, res, next) => {
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
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
