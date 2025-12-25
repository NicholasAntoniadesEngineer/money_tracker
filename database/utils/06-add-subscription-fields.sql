-- Add subscription management fields
-- Run this AFTER 01-schema-fresh-install.sql
-- Adds fields for pending plan changes and recurring billing toggle

-- Add pending plan change fields (for scheduled downgrades)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_plan_id BIGINT REFERENCES subscription_plans(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_change_date TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS change_type TEXT CHECK (change_type IN ('upgrade', 'downgrade'));

-- Add recurring billing toggle
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS recurring_billing_enabled BOOLEAN DEFAULT true;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'subscriptions'
  AND column_name IN ('pending_plan_id', 'pending_change_date', 'change_type', 'recurring_billing_enabled')
ORDER BY column_name;

