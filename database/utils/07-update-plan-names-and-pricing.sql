-- Update subscription plan names and pricing
-- Free plan: 0 euros
-- Premium plan: 5 euros

-- Update Free plan (plan_id = 1) - rename from "Monthly Subscription" to "Free" and set price to 0
UPDATE subscription_plans 
SET 
    plan_name = 'Free',
    price_amount = 0.00,
    plan_description = 'Free access to Money Tracker with basic features'
WHERE id = 1;

-- Update Premium plan (plan_id = 3) - rename from "Premium Subscription" to "Premium" and set price to 5
UPDATE subscription_plans 
SET 
    plan_name = 'Premium',
    price_amount = 5.00,
    plan_description = 'Premium access with priority support and advanced analytics'
WHERE id = 3;

-- Verify updates
SELECT id, plan_name, price_amount, price_currency, billing_interval, is_active 
FROM subscription_plans 
WHERE is_active = true
ORDER BY price_amount ASC;

