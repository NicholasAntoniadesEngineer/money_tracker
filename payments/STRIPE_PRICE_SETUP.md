# Stripe Price Setup Guide

This guide explains how to create Stripe Price objects and update the database with `stripe_price_id` values.

## Prerequisites

- Stripe account with API access
- Access to Stripe Dashboard
- Access to Supabase Dashboard or database

## Steps

### 1. Create Stripe Price Objects

For each subscription plan in your database, create a corresponding Stripe Price:

1. Go to Stripe Dashboard → Products → Create Product
2. For each plan:
   - **Name**: Match your plan name (e.g., "Monthly Subscription", "Premium Subscription")
   - **Pricing**: Set the price amount and currency
   - **Billing period**: Monthly (or match your plan interval)
   - **Recurring**: Enable recurring billing
3. After creating each Price, copy the **Price ID** (starts with `price_`)

### 2. Update Database

Run the following SQL in Supabase SQL Editor to update `subscription_plans` table:

```sql
-- Update subscription_plans with Stripe Price IDs
-- Replace the price IDs with your actual Stripe Price IDs

-- Example for Monthly Subscription (plan_id = 1)
UPDATE subscription_plans 
SET stripe_price_id = 'price_xxxxxxxxxxxxxxxxxxxxx'
WHERE id = 1;

-- Example for Premium Subscription (plan_id = 3)
UPDATE subscription_plans 
SET stripe_price_id = 'price_yyyyyyyyyyyyyyyyyyyyy'
WHERE id = 3;

-- Verify updates
SELECT id, plan_name, price_amount, stripe_price_id 
FROM subscription_plans 
WHERE is_active = true;
```

### 3. Verify Setup

1. Check that all active plans have `stripe_price_id` set
2. Test creating a checkout session with a plan that has a Price ID
3. Verify the subscription is created correctly in Stripe

## Notes

- Price IDs are different for test and live modes
- Update both test and live Price IDs if you have separate environments
- The `update-subscription` Edge Function requires Price IDs to work correctly

