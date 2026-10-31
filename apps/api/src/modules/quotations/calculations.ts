export type QuotationLineInput = {
  quantity: number;
  unitPricePaise: number;
};

export function calculateQuotationTotals(
  lines: QuotationLineInput[],
  discountPaise: number,
  taxRateBps: number
) {
  const subtotalPaise = lines.reduce(
    (total, line) => total + line.quantity * line.unitPricePaise,
    0
  );
  const boundedDiscount = Math.min(Math.max(0, discountPaise), subtotalPaise);
  const taxablePaise = subtotalPaise - boundedDiscount;
  const taxPaise = Math.round(taxablePaise * taxRateBps / 10_000);
  return {
    subtotalPaise,
    discountPaise: boundedDiscount,
    taxPaise,
    totalPaise: taxablePaise + taxPaise
  };
}
