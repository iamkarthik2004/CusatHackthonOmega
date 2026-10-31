CREATE TABLE invoice_line_taxes (
  invoice_line_id UUID NOT NULL REFERENCES invoice_lines(id) ON DELETE CASCADE,
  tax_id UUID NOT NULL REFERENCES taxes(id),
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  PRIMARY KEY (invoice_line_id, tax_id)
);

CREATE TABLE discount_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
  CHECK (product_id IS NOT NULL OR plan_id IS NOT NULL),
  UNIQUE (discount_id, product_id, plan_id)
);

CREATE TABLE discount_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id UUID NOT NULL REFERENCES discounts(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payments_customer_reference_idx
  ON payments (customer_id, reference)
  WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_payment_overallocation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  payment_total BIGINT;
  invoice_total BIGINT;
  payment_allocated BIGINT;
  invoice_allocated BIGINT;
  invoice_customer UUID;
BEGIN
  SELECT amount_paise INTO payment_total FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT total_paise, customer_id INTO invoice_total, invoice_customer FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF invoice_customer IS NULL THEN RAISE EXCEPTION 'Invoice does not exist'; END IF;
  IF NOT EXISTS (SELECT 1 FROM payments WHERE id = NEW.payment_id AND customer_id = invoice_customer) THEN
    RAISE EXCEPTION 'Payment customer does not match invoice customer';
  END IF;
  SELECT COALESCE(SUM(amount_paise), 0) INTO payment_allocated FROM payment_allocations WHERE payment_id = NEW.payment_id AND invoice_id <> NEW.invoice_id;
  SELECT COALESCE(SUM(amount_paise), 0) INTO invoice_allocated FROM payment_allocations WHERE invoice_id = NEW.invoice_id AND payment_id <> NEW.payment_id;
  IF payment_allocated + NEW.amount_paise > payment_total THEN RAISE EXCEPTION 'Payment allocation exceeds payment amount'; END IF;
  IF invoice_allocated + NEW.amount_paise > invoice_total THEN RAISE EXCEPTION 'Payment allocation exceeds invoice balance'; END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER payment_allocation_integrity
AFTER INSERT OR UPDATE ON payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION prevent_payment_overallocation();
