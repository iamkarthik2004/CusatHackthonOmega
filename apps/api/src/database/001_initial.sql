CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');
CREATE TYPE subscription_status AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED');
CREATE TYPE billing_interval AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED');

CREATE TABLE roles (
  id user_role PRIMARY KEY,
  description TEXT NOT NULL
);
INSERT INTO roles VALUES
  ('ADMIN', 'Full system access'), ('STAFF', 'Operational financial access'), ('CUSTOMER', 'Own-account access')
ON CONFLICT DO NOTHING;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'CUSTOMER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id),
  legal_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  tax_id TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'IN',
  state_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL,
  sales_price_paise BIGINT NOT NULL CHECK (sales_price_paise >= 0),
  cost_price_paise BIGINT NOT NULL DEFAULT 0 CHECK (cost_price_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  price_adjustment_paise BIGINT NOT NULL DEFAULT 0,
  UNIQUE(product_id, name)
);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  interval billing_interval NOT NULL,
  minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  available_from DATE NOT NULL,
  available_until DATE,
  auto_close_after_days INTEGER CHECK (auto_close_after_days IS NULL OR auto_close_after_days >= 0),
  CHECK (available_until IS NULL OR available_until >= available_from)
);

CREATE TABLE taxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  jurisdiction TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE
);

CREATE TABLE discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fixed', 'percentage')),
  value BIGINT NOT NULL CHECK (value >= 0),
  minimum_purchase_paise BIGINT NOT NULL DEFAULT 0 CHECK (minimum_purchase_paise >= 0),
  minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  starts_on DATE NOT NULL,
  ends_on DATE,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  UNIQUE(name, starts_on)
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  status subscription_status NOT NULL DEFAULT 'DRAFT',
  starts_on DATE NOT NULL,
  expires_on DATE,
  next_billing_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR expires_on >= starts_on)
);

CREATE TABLE subscription_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0)
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  service_period_start DATE NOT NULL,
  service_period_end DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'DRAFT',
  subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  tax_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  total_paise BIGINT GENERATED ALWAYS AS (subtotal_paise - discount_paise + tax_paise) STORED,
  due_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, service_period_start, service_period_end),
  CHECK (discount_paise <= subtotal_paise)
);

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
  line_total_paise BIGINT GENERATED ALWAYS AS (quantity * unit_price_paise) STORED
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'upi', 'card', 'cheque', 'other')),
  reference TEXT,
  received_on DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE payment_allocations (
  payment_id UUID NOT NULL REFERENCES payments(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  PRIMARY KEY (payment_id, invoice_id)
);

CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE billing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PREVIEW', 'RUNNING', 'COMPLETED', 'FAILED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE billing_run_items (
  billing_run_id UUID NOT NULL REFERENCES billing_runs(id),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('INVOICED', 'SKIPPED', 'FAILED', 'PENDING')),
  reason TEXT,
  invoice_id UUID REFERENCES invoices(id),
  PRIMARY KEY (billing_run_id, subscription_id),
  CHECK (outcome = 'INVOICED' OR reason IS NOT NULL)
);

CREATE TABLE audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_due_idx ON subscriptions (next_billing_on) WHERE status = 'ACTIVE';
CREATE INDEX invoices_customer_status_idx ON invoices (customer_id, status, due_on);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);
CREATE INDEX subscription_events_replay_idx ON subscription_events (subscription_id, occurred_at);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, occurred_at);
