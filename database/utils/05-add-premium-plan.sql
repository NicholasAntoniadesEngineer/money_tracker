-- Add Premium Subscription Plan (10 EUR/month)
-- Run this AFTER 04-populate-subscription-plans.sql
-- This creates the premium subscription plan

-- Insert premium monthly subscription plan (10 EUR/month, 30-day trial)
INSERT INTO subscription_plans (plan_name, plan_description, price_amount, price_currency, billing_interval, trial_period_days, is_active, created_at, updated_at)
VALUES (
    'Premium Subscription',
    'Premium monthly access to Money Tracker application with advanced features',
    10.00,
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

-- Verify both plans exist
SELECT id, plan_name, price_amount, price_currency, billing_interval, trial_period_days, is_active
FROM subscription_plans
WHERE is_active = true
ORDER BY price_amount ASC;

