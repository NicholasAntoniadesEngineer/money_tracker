-- Complete setup for Free and Premium subscription plans
-- This script can be run on a fresh database or to update existing plans
-- Run this AFTER 01-schema-fresh-install.sql

-- First, deactivate any existing plans to avoid conflicts
UPDATE subscription_plans 
SET is_active = false 
WHERE is_active = true;

-- Insert or update Free plan (plan_id = 1)
INSERT INTO subscription_plans (
    id,
    plan_name, 
    plan_description, 
    price_amount, 
    price_currency, 
    billing_interval, 
    trial_period_days, 
    is_active, 
    created_at, 
    updated_at
)
VALUES (
    1,
    'Free',
    'Free access to Money Tracker with basic features',
    0.00,
    'eur',
    'month',
    0, -- No trial period for free plan
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    plan_description = EXCLUDED.plan_description,
    price_amount = EXCLUDED.price_amount,
    price_currency = EXCLUDED.price_currency,
    billing_interval = EXCLUDED.billing_interval,
    trial_period_days = EXCLUDED.trial_period_days,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Insert or update Premium plan (plan_id = 3)
INSERT INTO subscription_plans (
    id,
    plan_name, 
    plan_description, 
    price_amount, 
    price_currency, 
    billing_interval, 
    trial_period_days, 
    is_active, 
    created_at, 
    updated_at
)
VALUES (
    3,
    'Premium',
    'Premium access with priority support and advanced analytics',
    5.00,
    'eur',
    'month',
    30, -- 30-day trial period for premium
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    plan_description = EXCLUDED.plan_description,
    price_amount = EXCLUDED.price_amount,
    price_currency = EXCLUDED.price_currency,
    billing_interval = EXCLUDED.billing_interval,
    trial_period_days = EXCLUDED.trial_period_days,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- Verify the plans were set up correctly
SELECT 
    id, 
    plan_name, 
    price_amount, 
    price_currency, 
    billing_interval, 
    trial_period_days, 
    is_active,
    created_at,
    updated_at
FROM subscription_plans 
WHERE is_active = true
ORDER BY price_amount ASC;

-- Expected output:
-- id | plan_name | price_amount | price_currency | billing_interval | trial_period_days | is_active
--  1 | Free      |         0.00 | eur            | month            |                 0 | true
--  3 | Premium   |         5.00 | eur            | month            |                30 | true

