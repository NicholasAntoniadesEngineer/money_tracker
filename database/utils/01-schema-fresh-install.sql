-- Money Tracker Database Schema - Fresh Install
-- Supabase PostgreSQL Schema
-- Run this script ONCE in Supabase SQL Editor for a fresh installation
-- This creates separate tables for example months and user months
-- 
-- SETUP ORDER:
-- 1. Run this script first (01-schema-fresh-install.sql)
-- 2. Run 02-populate-example-data.sql for example data
-- 3. Run 03-enable-public-access.sql if not using authentication
-- 4. Run 04-populate-subscription-plans.sql to create default subscription plan

-- User months table (for user-created months)
CREATE TABLE IF NOT EXISTS user_months (
    user_id UUID NOT NULL,
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    month_name TEXT NOT NULL,
    date_range JSONB DEFAULT '{}',
    weekly_breakdown JSONB DEFAULT '[]',
    fixed_costs JSONB DEFAULT '[]',
    variable_costs JSONB DEFAULT '[]',
    unplanned_expenses JSONB DEFAULT '[]',
    income_sources JSONB DEFAULT '[]',
    pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year, month)
);

-- Example months table (for protected example data)
CREATE TABLE IF NOT EXISTS example_months (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    month_name TEXT NOT NULL,
    date_range JSONB DEFAULT '{}',
    weekly_breakdown JSONB DEFAULT '[]',
    fixed_costs JSONB DEFAULT '[]',
    variable_costs JSONB DEFAULT '[]',
    unplanned_expenses JSONB DEFAULT '[]',
    income_sources JSONB DEFAULT '[]',
    pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month)
);

-- Pots table (user-specific savings pots)
CREATE TABLE IF NOT EXISTS pots (
    user_id UUID NOT NULL,
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    estimated_amount NUMERIC(12, 2) DEFAULT 0,
    actual_amount NUMERIC(12, 2) DEFAULT 0,
    comments TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (one row per user)
CREATE TABLE IF NOT EXISTS settings (
    user_id UUID NOT NULL,
    id BIGSERIAL PRIMARY KEY,
    currency TEXT DEFAULT '£',
    font_size TEXT DEFAULT '16',
    default_fixed_costs JSONB DEFAULT '[]',
    default_variable_categories JSONB DEFAULT '["Food", "Travel/Transport", "Activities"]',
    default_pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Subscription plans table (defines available subscription plans)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id BIGSERIAL PRIMARY KEY,
    plan_name TEXT NOT NULL UNIQUE,
    plan_description TEXT,
    price_amount NUMERIC(10, 2) NOT NULL,
    price_currency TEXT DEFAULT 'eur',
    billing_interval TEXT DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
    trial_period_days INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    stripe_price_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table (tracks user subscription status and trials)
-- DISTINCTION: subscription_type clearly separates 'trial' (free, no payment) from 'paid' (requires Stripe payment)
-- status tracks lifecycle: 'trial', 'active', 'expired', 'cancelled', 'past_due'
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id UUID NOT NULL PRIMARY KEY,
    plan_id BIGINT REFERENCES subscription_plans(id),
    -- subscription_type: 'trial' = free trial (no payment), 'paid' = paid subscription (Stripe payment required)
    subscription_type TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_type IN ('trial', 'paid')),
    -- status: lifecycle state ('trial', 'active', 'expired', 'cancelled', 'past_due')
    status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'past_due')),
    -- Trial period dates (used for both trial and paid subscriptions that started with a trial)
    trial_start_date TIMESTAMPTZ,
    trial_end_date TIMESTAMPTZ,
    -- Paid subscription dates (only set when subscription_type = 'paid')
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,
    -- Stripe payment information (only set when subscription_type = 'paid')
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    last_payment_date TIMESTAMPTZ,
    cancellation_date TIMESTAMPTZ,
    cancellation_reason TEXT,
    -- Pending plan changes (for scheduled downgrades)
    pending_plan_id BIGINT REFERENCES subscription_plans(id),
    pending_change_date TIMESTAMPTZ,
    change_type TEXT CHECK (change_type IN ('upgrade', 'downgrade')),
    -- Recurring billing toggle
    recurring_billing_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment history table (logs all payment transactions)
CREATE TABLE IF NOT EXISTS payment_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    subscription_id UUID REFERENCES subscriptions(user_id),
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    stripe_invoice_id TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'eur',
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
    payment_method TEXT,
    payment_date TIMESTAMPTZ DEFAULT NOW(),
    refunded_amount NUMERIC(10, 2) DEFAULT 0,
    refunded_date TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stripe webhook events table (tracks Stripe webhook events for audit)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    stripe_event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    user_id UUID,
    subscription_id UUID REFERENCES subscriptions(user_id),
    payment_id BIGINT REFERENCES payment_history(id),
    event_data JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_months_user_id ON user_months(user_id);
CREATE INDEX IF NOT EXISTS idx_user_months_year_month ON user_months(year, month);
CREATE INDEX IF NOT EXISTS idx_user_months_user_year_month ON user_months(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_user_months_created_at ON user_months(created_at);
CREATE INDEX IF NOT EXISTS idx_example_months_year_month ON example_months(year, month);
CREATE INDEX IF NOT EXISTS idx_example_months_created_at ON example_months(created_at);
CREATE INDEX IF NOT EXISTS idx_pots_user_id ON pots(user_id);
CREATE INDEX IF NOT EXISTS idx_pots_created_at ON pots(created_at);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscription_type ON subscriptions(subscription_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_type_status ON subscriptions(subscription_type, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end_date ON subscriptions(trial_end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscription_end_date ON subscriptions(subscription_end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON payment_history(payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_payment_intent_id ON payment_history(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_stripe_event_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_user_id ON stripe_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed ON stripe_webhook_events(processed);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_user_months_updated_at BEFORE UPDATE ON user_months
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_example_months_updated_at BEFORE UPDATE ON example_months
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pots_updated_at BEFORE UPDATE ON pots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE user_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE example_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE pots ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
-- Note: Adjust these policies based on your authentication requirements
CREATE POLICY "Allow all operations for authenticated users" ON user_months
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON example_months
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON pots
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON settings
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON subscription_plans
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON subscriptions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON payment_history
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON stripe_webhook_events
    FOR ALL USING (true) WITH CHECK (true);

-- For public access (if needed), use:
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON user_months;
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON example_months;
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON pots;
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON settings;
-- CREATE POLICY "Allow public access" ON user_months FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public access" ON example_months FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public access" ON pots FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public access" ON settings FOR ALL USING (true) WITH CHECK (true);

