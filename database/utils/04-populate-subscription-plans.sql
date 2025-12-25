-- Populate Subscription Plans
-- Run this AFTER 01-schema-fresh-install.sql
-- This creates the default subscription plan

-- Insert default monthly subscription plan (5 EUR/month, 30-day trial)
INSERT INTO subscription_plans (plan_name, plan_description, price_amount, price_currency, billing_interval, trial_period_days, is_active, created_at, updated_at)
VALUES (
    'Monthly Subscription',
    'Monthly access to Money Tracker application',
    5.00,
    'eur',
    'month',
    30,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (plan_name) DO UPDATE SET
    plan_description = EXCLUDED.plan_description,
    price_amount = EXCLUDED.price_amount,
    price_currency = EXCLUDED.price_currency,
    billing_interval = EXCLUDED.billing_interval,
    trial_period_days = EXCLUDED.trial_period_days,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Verify the plan was inserted
SELECT id, plan_name, price_amount, price_currency, billing_interval, trial_period_days, is_active
FROM subscription_plans
WHERE is_active = true;

