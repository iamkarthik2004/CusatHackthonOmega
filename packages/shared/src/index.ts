import { z } from "zod";

export const roleSchema = z.enum(["ADMIN", "STAFF", "CUSTOMER"]);
export type Role = z.infer<typeof roleSchema>;

export const billingIntervalSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const subscriptionStatusSchema = z.enum(["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const moneySchema = z.number().int().nonnegative();
export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(9)
});

export type Money = number;

export function formatMoney(paise: Money): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(paise / 100);
}

export function monthlyRecurringRevenue(amount: Money, interval: BillingInterval): Money {
  switch (interval) {
    case "daily": return Math.round(amount * 365 / 12);
    case "weekly": return Math.round(amount * 52 / 12);
    case "yearly": return Math.round(amount / 12);
    case "monthly": return amount;
  }
}

export function calculateInvoiceTotals(subtotal: Money, discount: Money, taxRate: number) {
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * taxRate);
  return { subtotal, discount, tax, total: taxable + tax };
}

export const lifecycleTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: ["QUOTATION", "CLOSED"],
  QUOTATION: ["CONFIRMED", "DRAFT", "CLOSED"],
  CONFIRMED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVE", "CLOSED"],
  CLOSED: []
};
