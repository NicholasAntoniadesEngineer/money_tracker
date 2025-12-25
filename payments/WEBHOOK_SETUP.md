# Stripe Webhook Setup Guide

## Overview

The webhook handler automatically:
- ✅ Updates subscription status in Supabase when payments succeed
- ✅ Records payment history
- ✅ Generates invoice records
- ✅ Sends confirmation emails (requires email service setup)

## Deployment Steps

### 1. Deploy Webhook Edge Function

1. Go to **Supabase Dashboard** → **Edge Functions**
2. Click **"Create new function"**
3. Name: `stripe-webhook`
4. Copy code from: `payments/backend/supabase-edge-function/stripe-webhook.ts`
5. Paste and deploy

### 2. Set Environment Variables

Go to Edge Functions → Settings → Environment Variables:

- **STRIPE_RESTRICTED_KEY** = `rk_test_51QAQyCClUqvgxZvpKaTgchHG8wvTU069VUU1yrF7slV03H9htAgNJOCjgbS3DpLZAN4r9eLseB8njvy1xUVCoBlE003Y4K4ytP`
- **STRIPE_WEBHOOK_SECRET** = `whsec_Mf6471Fw5xGEIQt0lPi3YlYYxcemrcgS` (your webhook signing secret)
- **SUPABASE_URL** = `https://ofutzrxfbrgtbkyafndv.supabase.co`
- **SUPABASE_SERVICE_KEY** = Your Supabase service role key (from Settings → API → service_role key)

### 3. Create Stripe Webhook Endpoint

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://ofutzrxfbrgtbkyafndv.supabase.co/functions/v1/stripe-webhook`
4. **Description**: "Money Tracker subscription webhooks"
5. **Events to send**:
   - `checkout.session.completed` - When checkout completes
   - `customer.subscription.created` - When subscription is created
   - `customer.subscription.updated` - When subscription changes
   - `customer.subscription.deleted` - When subscription is cancelled
   - `invoice.payment_succeeded` - When payment succeeds
   - `invoice.payment_failed` - When payment fails
   - `payment_intent.succeeded` - When payment intent succeeds
6. Click **"Add endpoint"**
7. **Copy the "Signing secret"** (starts with `whsec_`)
8. **Add it to Edge Function environment variables** as `STRIPE_WEBHOOK_SECRET`
   - Your signing secret: `whsec_Mf6471Fw5xGEIQt0lPi3YlYYxcemrcgS`

## How It Works

### Payment Flow:

1. **User completes checkout** → Stripe creates subscription
2. **Stripe sends webhook** → `checkout.session.completed`
3. **Webhook handler**:
   - Updates `subscriptions` table with Stripe data
   - Records payment in `payment_history`
   - Sends confirmation email
4. **Database is updated** → User subscription is now active

### Recurring Payment Flow:

1. **Stripe charges customer** → Monthly subscription renewal
2. **Stripe sends webhook** → `invoice.payment_succeeded`
3. **Webhook handler**:
   - Records payment in `payment_history`
   - Updates `last_payment_date` in `subscriptions`
   - Sends invoice email
4. **Database updated** → Payment history recorded

### Payment Failure Flow:

1. **Payment fails** → Stripe attempts retry
2. **Stripe sends webhook** → `invoice.payment_failed`
3. **Webhook handler**:
   - Records failed payment
   - Updates subscription status to `past_due`
   - Sends payment failed email
4. **User notified** → Can update payment method

## Database Updates

The webhook automatically updates:

### `subscriptions` table:
- `subscription_type` → `'paid'`
- `status` → `'active'`, `'past_due'`, or `'cancelled'`
- `stripe_customer_id` → Stripe customer ID
- `stripe_subscription_id` → Stripe subscription ID
- `stripe_price_id` → Stripe price ID
- `plan_id` → Plan ID from metadata
- `subscription_start_date` → Subscription start
- `subscription_end_date` → Subscription end
- `next_billing_date` → Next billing date
- `last_payment_date` → Last successful payment
- `cancellation_date` → When cancelled (if applicable)

### `payment_history` table:
- Records all successful payments
- Records failed payments
- Includes invoice IDs, payment intent IDs
- Stores metadata for audit trail

### `stripe_webhook_events` table:
- Stores all webhook events for audit
- Tracks processing status
- Stores error messages if processing fails

## Email Notifications

### Current Status:
- Email sending is **logged but not implemented**
- Stripe sends basic emails automatically (can be configured in Stripe Dashboard)

### To Implement Email Sending:

**Option 1: Use Supabase Edge Function**
- Create `send-email` Edge Function
- Use email service (SendGrid, Mailgun, etc.)
- Update `sendConfirmationEmail()` in webhook handler

**Option 2: Use Stripe's Built-in Emails**
- Go to Stripe Dashboard → Settings → Emails
- Configure email templates
- Stripe sends emails automatically

**Option 3: Use Supabase Email**
- Use Supabase's email service (if available)
- Configure SMTP settings
- Update webhook handler to use Supabase email

## Testing

### Test Webhook Locally:
```bash
# Use Stripe CLI
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

### Test in Production:
1. Make a test payment
2. Check Supabase logs: Edge Functions → Logs
3. Check database: `subscriptions` and `payment_history` tables
4. Verify webhook events: `stripe_webhook_events` table

## Troubleshooting

### Webhook Not Receiving Events
- Check webhook endpoint URL is correct
- Verify webhook is enabled in Stripe Dashboard
- Check Edge Function is deployed
- Check Edge Function logs for errors

### Database Not Updating
- Check `STRIPE_WEBHOOK_SECRET` is correct
- Check `SUPABASE_SERVICE_KEY` has write permissions
- Check webhook event logs in `stripe_webhook_events` table
- Verify `userId` is in Stripe customer metadata

### Emails Not Sending
- Email sending is currently logged only
- Implement email service as described above
- Or use Stripe's built-in email notifications

## Files Reference

- **Webhook Handler**: `payments/backend/supabase-edge-function/stripe-webhook.ts`
- **Database Schema**: `database/utils/01-schema-fresh-install.sql`
- **Payment Service**: `payments/services/PaymentService.js`
- **Subscription Service**: `payments/services/SubscriptionService.js`

