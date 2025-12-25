# Complete Payment System Setup Guide

This guide covers all steps to set up the payment system from scratch, including Stripe configuration, database setup, Edge Functions deployment, and webhook configuration.

## Prerequisites

- Stripe account (test mode is fine for development)
- Supabase project with database access
- Access to Supabase Dashboard
- Access to Stripe Dashboard

## Step 1: Stripe Account Setup

### 1.1 Get Stripe API Keys

1. Go to **Stripe Dashboard** → **Developers** → **API keys**
2. Copy the following keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)
   - **Restricted key** (optional, more secure - starts with `rk_test_` or `rk_live_`)

### 1.2 Create Stripe Price Objects

For each subscription plan, create a Stripe Price:

1. Go to **Stripe Dashboard** → **Products** → **Create Product**
2. For each plan:
   - **Name**: Match your plan name (e.g., "Monthly Subscription", "Premium Subscription")
   - **Pricing**: Set price amount and currency (e.g., €5.00)
   - **Billing period**: Monthly (or match your plan interval)
   - **Recurring**: Enable recurring billing
3. After creating each Price, copy the **Price ID** (starts with `price_`)

**Note**: You'll need these Price IDs for Step 3.

## Step 2: Database Setup

### 2.1 Run Schema Migrations

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Run the following SQL files in order:

```sql
-- 1. Main schema (if not already run)
-- File: database/utils/01-schema-fresh-install.sql

-- 2. Add subscription management fields
-- File: database/utils/06-add-subscription-fields.sql
```

The migration adds these fields to the `subscriptions` table:
- `pending_plan_id` - For scheduled downgrades
- `pending_change_date` - When downgrade takes effect
- `change_type` - 'upgrade' or 'downgrade'
- `recurring_billing_enabled` - Toggle for auto-renewal (default: true)

### 2.2 Update Subscription Plans with Stripe Price IDs

Run this SQL to update your `subscription_plans` table with the Stripe Price IDs you created in Step 1.2:

```sql
-- Replace the price IDs with your actual Stripe Price IDs from Step 1.2

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

**Important**: All active plans must have a `stripe_price_id` for the subscription update system to work.

## Step 3: Deploy Edge Functions

### 3.1 Deploy create-checkout-session

1. Go to **Supabase Dashboard** → **Edge Functions** → **Create new function**
2. **Name**: `create-checkout-session`
3. **Copy code from**: `payments/backend/supabase-edge-function/create-checkout-session.ts`
4. **Set environment variable**:
   - `STRIPE_RESTRICTED_KEY` = Your Stripe restricted key (or secret key)
5. **Deploy**

### 3.2 Deploy update-subscription

1. Go to **Supabase Dashboard** → **Edge Functions** → **Create new function**
2. **Name**: `update-subscription`
3. **Copy code from**: `payments/backend/supabase-edge-function/update-subscription.ts`
4. **Set environment variables**:
   - `STRIPE_RESTRICTED_KEY` = Your Stripe restricted key (or secret key)
   - Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available by default in Edge Functions
5. **Deploy**

### 3.3 Deploy stripe-webhook

1. Go to **Supabase Dashboard** → **Edge Functions** → **Create new function**
2. **Name**: `stripe-webhook`
3. **Copy code from**: `payments/backend/supabase-edge-function/stripe-webhook.ts`
4. **Set environment variables**:
   - `STRIPE_RESTRICTED_KEY` = Your Stripe restricted key (or secret key)
   - `STRIPE_WEBHOOK_SECRET` = Your webhook signing secret (from Step 4.2)
   - Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available by default in Edge Functions
5. **Deploy**

### 3.4 Supabase Secrets (Available by Default)

Edge Functions automatically have access to:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key (bypasses RLS)
- `SUPABASE_ANON_KEY` - Your anon key (for client-side use)

No need to set these manually - they're available automatically!

## Step 4: Configure Stripe Webhooks

### 4.1 Create Webhook Endpoint

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
   - Replace `YOUR_PROJECT` with your Supabase project reference ID
4. **Description**: "Money Tracker Payment Webhooks"

### 4.2 Select Events

Select these events to listen to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_intent.succeeded`

### 4.3 Get Webhook Signing Secret

1. After creating the endpoint, click on it
2. Copy the **Signing secret** (starts with `whsec_`)
3. Use this for `STRIPE_WEBHOOK_SECRET` in the `stripe-webhook` Edge Function

## Step 5: Configure Client-Side Stripe

### 5.1 Update Stripe Config

Ensure your `payments/config/stripe-config.js` has the correct publishable key:

```javascript
const StripeConfig = {
    getPublishableKey() {
        return 'pk_test_xxxxxxxxxxxxxxxxxxxxx'; // Your publishable key from Step 1.1
    }
};
```

## Step 6: Testing

### 6.1 Test Checkout Flow

1. Navigate to the upgrade page in your application
2. Click "Upgrade" on a plan
3. Complete Stripe Checkout with test card: `4242 4242 4242 4242`
4. Verify:
   - Redirects back to success page
   - Subscription appears in Stripe Dashboard
   - Database `subscriptions` table is updated
   - Webhook events are received

### 6.2 Test Upgrade/Downgrade

1. **Upgrade**: Select a higher-tier plan
   - Should cancel old subscription immediately
   - Should create new subscription with proration
   - Should update database immediately

2. **Downgrade**: Select a lower-tier plan
   - Should schedule cancellation at period end
   - Should set `pending_plan_id` in database
   - Should maintain premium access until period ends

### 6.3 Test Recurring Billing Toggle

1. Go to Settings page
2. Toggle "Auto-Renewal" on/off
3. Verify:
   - Toggle updates in Stripe (check `cancel_at_period_end` flag)
   - Database `recurring_billing_enabled` field updates
   - Status message displays correctly

### 6.4 Verify Database

Run these queries to verify everything is working:

```sql
-- Check subscriptions
SELECT 
    user_id,
    plan_id,
    subscription_type,
    status,
    stripe_subscription_id,
    recurring_billing_enabled,
    pending_plan_id,
    pending_change_date,
    change_type
FROM subscriptions
WHERE subscription_type = 'paid';

-- Check payment history
SELECT * FROM payment_history 
ORDER BY created_at DESC 
LIMIT 10;
```

## Step 7: Environment Variables Summary

Here's a complete list of all environment variables needed:

### Edge Functions Environment Variables

| Function | Variable | Description |
|----------|----------|-------------|
| `create-checkout-session` | `STRIPE_RESTRICTED_KEY` | Stripe restricted/secret key |
| `update-subscription` | `STRIPE_RESTRICTED_KEY` | Stripe restricted/secret key |
| `update-subscription` | `SUPABASE_URL` | Available by default (no setup needed) |
| `update-subscription` | `SUPABASE_SERVICE_ROLE_KEY` | Available by default (no setup needed) |
| `stripe-webhook` | `STRIPE_RESTRICTED_KEY` | Stripe restricted/secret key |
| `stripe-webhook` | `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (whsec_...) |
| `stripe-webhook` | `SUPABASE_URL` | Available by default (no setup needed) |
| `stripe-webhook` | `SUPABASE_SERVICE_ROLE_KEY` | Available by default (no setup needed) |

## Troubleshooting

### Checkout Not Working?

- ✅ Verify `create-checkout-session` Edge Function is deployed
- ✅ Check `STRIPE_RESTRICTED_KEY` is set correctly
- ✅ Verify CORS is handled (Edge Function should return 200 for OPTIONS)
- ✅ Check browser console for errors

### Webhook Not Receiving Events?

- ✅ Verify webhook endpoint URL in Stripe matches your Supabase URL
- ✅ Check `STRIPE_WEBHOOK_SECRET` matches exactly (no extra spaces)
- ✅ Verify Edge Function is deployed and running
- ✅ Check Edge Function logs in Supabase Dashboard
- ✅ Ensure events are selected in Stripe webhook configuration

### Subscription Updates Not Working?

- ✅ Verify `update-subscription` Edge Function is deployed
- ✅ Check all environment variables are set
- ✅ Ensure `stripe_price_id` is set in `subscription_plans` table
- ✅ Verify user has an active paid subscription
- ✅ Check Edge Function logs for errors

### Database Not Updating?

- ✅ Verify `SUPABASE_SERVICE_KEY` is the service role key (not anon key)
- ✅ Check `SUPABASE_URL` is correct
- ✅ Verify database schema migrations have been run
- ✅ Check Edge Function logs for database errors
- ✅ Ensure `userId` is in Stripe customer metadata

### Multiple Subscriptions Issue?

- ✅ The system automatically cancels existing subscriptions before creating new ones
- ✅ Webhook handler also checks for and cancels duplicates
- ✅ If you see multiple subscriptions, check Edge Function logs

## Files Reference

- **Edge Functions**:
  - `payments/backend/supabase-edge-function/create-checkout-session.ts`
  - `payments/backend/supabase-edge-function/update-subscription.ts`
  - `payments/backend/supabase-edge-function/stripe-webhook.ts`
- **Database Migrations**:
  - `database/utils/01-schema-fresh-install.sql`
  - `database/utils/06-add-subscription-fields.sql`
- **Client Services**:
  - `payments/services/StripeService.js`
  - `payments/services/SubscriptionService.js`
  - `payments/controllers/UpgradeController.js`
- **Configuration**:
  - `payments/config/stripe-config.js`
  - `database/config/supabase-config.js`

## Next Steps

After completing setup:

1. Test all flows (checkout, upgrade, downgrade, recurring billing toggle)
2. Monitor Edge Function logs for any errors
3. Set up monitoring/alerts for failed webhooks
4. Consider implementing email notifications (webhook handler logs email data)
5. Test with real cards in live mode before going to production

## Support

If you encounter issues:

1. Check Edge Function logs in Supabase Dashboard
2. Check Stripe Dashboard → Developers → Webhooks for event logs
3. Verify all environment variables are set correctly
4. Ensure database schema is up to date
5. Check browser console for client-side errors

