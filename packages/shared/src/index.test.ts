import { describe, expect, it } from "vitest";
import { calculateGst, calculateProration, determineGstTreatment, evaluateDiscount } from "./index.js";

describe("shared financial rules", () => {
  it("splits intra-state GST without losing a paise", () => {
    expect(determineGstTreatment("KL", "KL", 1800)).toBe("INTRA_STATE");
    expect(calculateGst(1001, 1800, "INTRA_STATE")).toEqual({ cgstPaise: 90, sgstPaise: 90, igstPaise: 0, totalPaise: 180 });
  });
  it("uses IGST for inter-state transactions", () => {
    expect(calculateGst(10000, 1800, "INTER_STATE").igstPaise).toBe(1800);
  });
  it("explains rejected discounts", () => {
    expect(evaluateDiscount({ kind: "percentage", value: 10, minimumPurchasePaise: 5000, minimumQuantity: 1, startsOn: "2026-01-01", usedCount: 0 }, 1000, 1, "2026-02-01").reason).toBe("Minimum purchase is not met");
  });
  it("calculates mid-cycle proration in integer paise", () => {
    expect(calculateProration(10000, 16000, 15, 30)).toBe(3000);
  });
});
