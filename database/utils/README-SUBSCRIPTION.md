# Subscription Database Setup

## SQL Scripts Execution Order

1. **01-schema-fresh-install.sql** - Creates all tables including subscription tables
2. **04-populate-subscription-plans.sql** - Creates the default subscription plan (5 EUR/month, 30-day trial)
3. **02-populate-example-data.sql** - Optional: Example financial data
4. **03-enable-public-access.sql** - Optional: Public access configuration

## Database Tables

### subscription_plans
Stores available subscription plans with pricing and trial information.

**Fields:**
- `id` - Primary key
- `plan_name` - Unique plan name
- `plan_description` - Plan description
- `price_amount` - Price in decimal (e.g., 5.00)
- `price_currency` - Currency code (default: 'eur')
- `billing_interval` - 'month' or 'year'
- `trial_period_days` - Number of trial days (default: 30)
- `is_active` - Whether plan is currently available
- `stripe_price_id` - Stripe price ID for this plan

### subscriptions
Tracks each user's subscription status and trial information.

**Fields:**
- `user_id` - Primary key, references auth.users
- `plan_id` - References subscription_plans(id)
- `status` - 'trial', 'active', 'expired', 'cancelled', 'past_due'
- `trial_start_date` - When trial started
- `trial_end_date` - When trial ends
- `subscription_start_date` - When paid subscription started
- `subscription_end_date` - When subscription ends
- `next_billing_date` - Next billing date for recurring subscription
- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Stripe subscription ID
- `stripe_price_id` - Stripe price ID
- `last_payment_date` - Last successful payment date
- `cancellation_date` - When subscription was cancelled
- `cancellation_reason` - Reason for cancellation

### payment_history
Logs all payment transactions.

**Fields:**
- `id` - Primary key
- `user_id` - User who made payment
- `subscription_id` - References subscriptions(user_id)
- `stripe_payment_intent_id` - Stripe payment intent ID
- `stripe_charge_id` - Stripe charge ID
- `stripe_invoice_id` - Stripe invoice ID
- `amount` - Payment amount
- `currency` - Currency code
- `status` - 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'
- `payment_method` - Payment method used
- `payment_date` - When payment occurred
- `refunded_amount` - Amount refunded (if any)
- `refunded_date` - When refund occurred
- `metadata` - JSONB field for additional data

### stripe_webhook_events
Tracks Stripe webhook events for audit and debugging.

**Fields:**
- `id` - Primary key
- `stripe_event_id` - Unique Stripe event ID
- `event_type` - Type of event (e.g., 'checkout.session.completed')
- `user_id` - Related user (if applicable)
- `subscription_id` - Related subscription (if applicable)
- `payment_id` - Related payment (if applicable)
- `event_data` - Full event data as JSONB
- `processed` - Whether event has been processed
- `processed_at` - When event was processed
- `error_message` - Error message if processing failed

## All Data Fetched from Database

All subscription information is now fetched from the database:
- Subscription status from `subscriptions` table
- Plan details from `subscription_plans` table
- Payment history from `payment_history` table
- Trial period from plan's `trial_period_days` field

No hardcoded values - everything comes from the database!

