ALTER TABLE taxes
  ADD COLUMN IF NOT EXISTS tax_type TEXT NOT NULL DEFAULT 'PERCENTAGE'
    CHECK (tax_type IN ('PERCENTAGE', 'CGST', 'SGST', 'IGST', 'EXEMPT')),
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS is_pausable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_renewable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_close_early BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD CONSTRAINT customers_gstin_format CHECK (
    gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx ON customers (email);

CREATE TABLE IF NOT EXISTS invoice_tax_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_name TEXT NOT NULL,
  tax_type TEXT NOT NULL,
  state_code TEXT,
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  UNIQUE (invoice_id, tax_name, tax_type)
);

CREATE TABLE IF NOT EXISTS lifecycle_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  requested_by UUID REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('UPGRADE', 'DOWNGRADE', 'SEAT_CHANGE', 'ADDON_ADD', 'ADDON_REMOVE')),
  effective_on DATE NOT NULL,
  old_amount_paise BIGINT NOT NULL CHECK (old_amount_paise >= 0),
  new_amount_paise BIGINT NOT NULL CHECK (new_amount_paise >= 0),
  proration_paise BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'REQUESTED', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS taxes_active_jurisdiction_idx ON taxes (is_active, jurisdiction, state_code, effective_from);
CREATE INDEX IF NOT EXISTS discounts_active_dates_idx ON discounts (is_active, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS lifecycle_requests_subscription_idx ON lifecycle_change_requests (subscription_id, created_at DESC);
