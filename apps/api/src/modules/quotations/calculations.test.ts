import { describe, expect, it } from "vitest";
import { calculateQuotationTotals } from "./calculations.js";

describe("quotation calculations", () => {
  it("applies discounts before tax using integer paise", () => {
    expect(calculateQuotationTotals(
      [{ quantity: 2, unitPricePaise: 1_000 }],
      500,
      1_800
    )).toEqual({
      subtotalPaise: 2_000,
      discountPaise: 500,
      taxPaise: 270,
      totalPaise: 1_770
    });
  });

  it("caps discounts at the subtotal", () => {
    expect(calculateQuotationTotals([{ quantity: 1, unitPricePaise: 1_001 }], 2_000, 0))
      .toEqual({ subtotalPaise: 1_001, discountPaise: 1_001, taxPaise: 0, totalPaise: 0 });
  });
});
