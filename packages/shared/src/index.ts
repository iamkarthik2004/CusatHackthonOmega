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

export type GstTreatment = "INTRA_STATE" | "INTER_STATE" | "EXEMPT";

export function determineGstTreatment(sellerState: string, customerState: string, rateBps: number): GstTreatment {
  if (rateBps === 0) return "EXEMPT";
  return sellerState.toUpperCase() === customerState.toUpperCase() ? "INTRA_STATE" : "INTER_STATE";
}

export function calculateGst(taxablePaise: Money, rateBps: number, treatment: GstTreatment) {
  const total = Math.round(taxablePaise * rateBps / 10_000);
  if (treatment === "INTRA_STATE") {
    const cgst = Math.floor(total / 2);
    return { cgstPaise: cgst, sgstPaise: total - cgst, igstPaise: 0, totalPaise: total };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: treatment === "EXEMPT" ? 0 : total, totalPaise: treatment === "EXEMPT" ? 0 : total };
}

export type DiscountRule = {
  kind: "fixed" | "percentage";
  value: number;
  minimumPurchasePaise: number;
  minimumQuantity: number;
  startsOn: string;
  endsOn?: string | null;
  usageLimit?: number | null;
  usedCount: number;
};

export function evaluateDiscount(rule: DiscountRule, subtotalPaise: Money, quantity: number, date: string) {
  if (date < rule.startsOn) return { eligible: false, discountPaise: 0, reason: "Discount has not started" };
  if (rule.endsOn && date > rule.endsOn) return { eligible: false, discountPaise: 0, reason: "Discount has expired" };
  if (subtotalPaise < rule.minimumPurchasePaise) return { eligible: false, discountPaise: 0, reason: "Minimum purchase is not met" };
  if (quantity < rule.minimumQuantity) return { eligible: false, discountPaise: 0, reason: "Minimum quantity is not met" };
  if (rule.usageLimit !== null && rule.usageLimit !== undefined && rule.usedCount >= rule.usageLimit) return { eligible: false, discountPaise: 0, reason: "Usage limit has been reached" };
  const amount = rule.kind === "fixed" ? rule.value : Math.round(subtotalPaise * rule.value / 100);
  return { eligible: true, discountPaise: Math.min(amount, subtotalPaise), reason: "Discount is eligible" };
}

export function calculateProration(oldAmountPaise: Money, newAmountPaise: Money, daysRemaining: number, daysInPeriod: number) {
  if (daysInPeriod <= 0 || daysRemaining < 0 || daysRemaining > daysInPeriod) throw new Error("Invalid proration period");
  return Math.round((newAmountPaise - oldAmountPaise) * daysRemaining / daysInPeriod);
}

export const lifecycleTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: ["QUOTATION", "CLOSED"],
  QUOTATION: ["CONFIRMED", "DRAFT", "CLOSED"],
  CONFIRMED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVE", "CLOSED"],
  CLOSED: []
};
