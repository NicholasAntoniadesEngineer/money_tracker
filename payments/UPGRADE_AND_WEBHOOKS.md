# Subscription Upgrade & Webhook Integration

## Summary

This implementation provides:
1. ✅ **Upgrade Page** - Users can upgrade/downgrade between plans (€0 → €5 → €10)
2. ✅ **Webhook Handler** - Automatically updates database when payments succeed
3. ✅ **Payment History** - Records all payments in database
4. ✅ **Invoice Generation** - Stores invoice data (Stripe generates invoices automatically)
5. ✅ **Email Notifications** - Framework ready (needs email service implementation)

## Files Created/Updated

### New Files:
- `payments/views/upgrade.html` - Upgrade subscription page
- `payments/controllers/UpgradeController.js` - Upgrade page controller
- `payments/backend/supabase-edge-function/stripe-webhook.ts` - Webhook handler
- `database/utils/05-add-premium-plan.sql` - Adds €10/month plan
- `payments/WEBHOOK_SETUP.md` - Webhook setup guide
- `payments/UPGRADE_AND_WEBHOOKS.md` - This file

### Updated Files:
- `payments/services/StripeService.js` - Added planId/priceAmount support
- `payments/backend/supabase-edge-function/index.ts` - Dynamic pricing support
- `payments/views/payment.html` - Added "Upgrade Plan" button
- `ui/views/settings.html` - Added "Upgrade Plan" button

## Setup Instructions

### Step 1: Add Premium Plan to Database

Run in Supabase SQL Editor:
```sql
-- File: database/utils/05-add-premium-plan.sql
```

This creates a €10/month "Premium Subscription" plan.

### Step 2: Deploy Webhook Handler

1. **Supabase Dashboard** → **Edge Functions** → **Create new function**
2. **Name**: `stripe-webhook`
3. **Copy code from**: `payments/backend/supabase-edge-function/stripe-webhook.ts`
4. **Deploy**

### Step 3: Set Environment Variables

Edge Functions → Settings → Environment Variables:

- `STRIPE_RESTRICTED_KEY` = `rk_test_51QAQyCClUqvgxZvpKaTgchHG8wvTU069VUU1yrF7slV03H9htAgNJOCjgbS3DpLZAN4r9eLseB8njvy1xUVCoBlE003Y4K4ytP`
- `STRIPE_WEBHOOK_SECRET` = `whsec_Mf6471Fw5xGEIQt0lPi3YlYYxcemrcgS` (your webhook signing secret)
- `SUPABASE_URL` = `https://ofutzrxfbrgtbkyafndv.supabase.co`
- `SUPABASE_SERVICE_KEY` = Your service role key (from Supabase Settings → API)

### Step 4: Create Stripe Webhook

1. **Stripe Dashboard** → **Developers** → **Webhooks** → **Add endpoint**
2. **URL**: `https://ofutzrxfbrgtbkyafndv.supabase.co/functions/v1/stripe-webhook`
3. **Events**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
4. **Copy signing secret** → Add to Edge Function env vars

## How It Works

### Upgrade Flow:

1. **User clicks "Upgrade Plan"** → Goes to upgrade page
2. **User selects plan** → Clicks upgrade button
3. **Stripe Checkout** → User enters payment details
4. **Payment succeeds** → Stripe sends webhook
5. **Webhook updates database**:
   - Updates `subscriptions` table
   - Records payment in `payment_history`
   - Sends confirmation email (if implemented)
6. **User subscription active** → Can use new plan features

### Database Updates (Automatic):

When payment succeeds, webhook automatically:

**Updates `subscriptions` table:**
- Sets `subscription_type = 'paid'`
- Sets `status = 'active'`
- Updates `plan_id` to new plan
- Sets `stripe_customer_id`, `stripe_subscription_id`
- Sets `subscription_start_date`, `subscription_end_date`
- Sets `next_billing_date`
- Sets `last_payment_date`

**Records in `payment_history` table:**
- Payment amount and currency
- Payment status (succeeded/failed)
- Stripe invoice ID
- Stripe payment intent ID
- Payment date
- Metadata for audit

**Stores in `stripe_webhook_events` table:**
- All webhook events for audit trail
- Processing status
- Error messages (if any)

## Invoice Generation

Stripe automatically generates invoices. The webhook:
- Stores `stripe_invoice_id` in `payment_history`
- Stores invoice URL in metadata
- Can send invoice emails (requires email service)

## Email Notifications

### Current Status:
- Email framework is ready
- `sendConfirmationEmail()` function exists
- Currently logs emails (not actually sent)

### To Enable Email Sending:

**Option 1: Use Stripe's Built-in Emails** (Easiest)
- Stripe Dashboard → Settings → Emails
- Configure email templates
- Stripe sends emails automatically
- No code changes needed

**Option 2: Implement Custom Email Service**
- Create `send-email` Edge Function
- Use SendGrid, Mailgun, or similar
- Update `sendConfirmationEmail()` in webhook handler
- See `WEBHOOK_SETUP.md` for details

## Testing

### Test Upgrade Flow:
1. Go to upgrade page
2. Select a plan
3. Use test card: `4242 4242 4242 4242`
4. Complete checkout
5. Check database:
   ```sql
   SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';
   SELECT * FROM payment_history WHERE user_id = 'YOUR_USER_ID';
   SELECT * FROM stripe_webhook_events ORDER BY created_at DESC LIMIT 10;
   ```

### Test Webhook:
1. Make a test payment
2. Check Edge Function logs in Supabase
3. Verify database was updated
4. Check `stripe_webhook_events` table

## Troubleshooting

### Upgrade Page Not Loading Plans
- Check database has subscription plans
- Run `05-add-premium-plan.sql` if needed
- Check browser console for errors

### Webhook Not Updating Database
- Verify webhook endpoint URL is correct
- Check `STRIPE_WEBHOOK_SECRET` matches Stripe
- Check `SUPABASE_SERVICE_KEY` has write permissions
- Check Edge Function logs for errors
- Verify `userId` is in Stripe customer metadata

### Payments Not Recorded
- Check webhook is receiving events
- Check `stripe_webhook_events` table
- Verify webhook handler is processing events
- Check Edge Function logs

## Next Steps

1. ✅ Deploy webhook handler
2. ✅ Set up Stripe webhook endpoint
3. ✅ Test payment flow
4. ⚠️ Implement email sending (optional - Stripe can handle this)
5. ✅ Monitor webhook events in database

## Files Reference

- **Upgrade Page**: `payments/views/upgrade.html`
- **Upgrade Controller**: `payments/controllers/UpgradeController.js`
- **Webhook Handler**: `payments/backend/supabase-edge-function/stripe-webhook.ts`
- **Webhook Setup**: `payments/WEBHOOK_SETUP.md`
- **Database Migration**: `database/utils/05-add-premium-plan.sql`

