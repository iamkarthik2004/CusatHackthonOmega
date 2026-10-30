-- Deterministic local demo data. Run after 001_initial.sql, 002_auth.sql, and 003_financial_operations.sql.
INSERT INTO plans (name, description, amount_paise, interval, minimum_quantity, available_from)
VALUES
  ('Starter', 'For focused teams', 399900, 'monthly', 1, '2026-01-01'),
  ('Growth', 'For growing operations', 699900, 'monthly', 1, '2026-01-01'),
  ('Scale', 'For complex organizations', 1499900, 'monthly', 1, '2026-01-01'),
  ('Enterprise Annual', 'Annual enterprise plan', 12000000, 'yearly', 1, '2026-01-01')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, description, product_type, sales_price_paise, cost_price_paise)
VALUES ('Tally Core', 'Subscription management workspace', 'software', 699900, 110000)
ON CONFLICT DO NOTHING;

INSERT INTO customers (legal_name, email, country_code, state_code)
SELECT 'Demo Customer ' || n, 'demo-' || n || '@example.test', 'IN',
       CASE (n % 5) WHEN 0 THEN 'KL' WHEN 1 THEN 'KA' WHEN 2 THEN 'MH' WHEN 3 THEN 'DL' ELSE 'TN' END
FROM generate_series(1, 10000) AS numbers(n)
ON CONFLICT (email) DO NOTHING;

INSERT INTO subscriptions (subscription_number, customer_id, plan_id, status, starts_on, next_billing_on)
SELECT 'SEED-SUB-' || lpad(row_number() OVER ()::text, 6, '0'),
       c.id, p.id, 'ACTIVE'::subscription_status,
       '2026-01-01', ('2026-11-01'::date + ((row_number() OVER () % 28)::int))
FROM customers c
JOIN plans p ON p.name = CASE
  WHEN regexp_replace(split_part(c.email, '@', 1), '^demo-', '')::int % 10 < 5 THEN 'Starter'
  WHEN regexp_replace(split_part(c.email, '@', 1), '^demo-', '')::int % 10 < 8 THEN 'Growth'
  ELSE 'Scale'
END
WHERE c.email LIKE 'demo-%@example.test'
ON CONFLICT (subscription_number) DO NOTHING;

INSERT INTO invoices
  (invoice_number, subscription_id, customer_id, service_period_start, service_period_end,
   status, subtotal_paise, due_on)
SELECT 'SEED-INV-' || s.subscription_number,
       s.id, s.customer_id, '2026-10-01', '2026-10-31', 'PAID',
       p.amount_paise, '2026-10-01'
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE s.subscription_number LIKE 'SEED-SUB-%'
ON CONFLICT (subscription_id, service_period_start, service_period_end) DO NOTHING;

INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price_paise)
SELECT i.id, 'Monthly subscription', 1, i.subtotal_paise
FROM invoices i
WHERE i.invoice_number LIKE 'SEED-INV-%'
  AND NOT EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoice_id = i.id);

INSERT INTO payments (customer_id, amount_paise, method, reference, received_on, notes)
SELECT i.customer_id, i.total_paise, 'bank_transfer', 'SEED-PAY-' || i.invoice_number, '2026-10-15', 'Seeded demo payment'
FROM invoices i
WHERE i.invoice_number LIKE 'SEED-INV-%'
ON CONFLICT (customer_id, reference) DO NOTHING;

INSERT INTO payment_allocations (payment_id, invoice_id, amount_paise)
SELECT p.id, i.id, i.total_paise
FROM invoices i
JOIN payments p ON p.reference = 'SEED-PAY-' || i.invoice_number
WHERE i.invoice_number LIKE 'SEED-INV-%'
ON CONFLICT (payment_id, invoice_id) DO NOTHING;
