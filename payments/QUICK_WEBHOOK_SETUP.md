# Quick Webhook Setup Checklist

## Your Webhook Signing Secret
**`whsec_Mf6471Fw5xGEIQt0lPi3YlYYxcemrcgS`**

## Step-by-Step Setup

### 1. Deploy Webhook Edge Function ✅

1. Go to **Supabase Dashboard** → **Edge Functions**
2. Click **"Create new function"** (or edit if exists)
3. **Name**: `stripe-webhook`
4. **Copy code from**: `payments/backend/supabase-edge-function/stripe-webhook.ts`
5. **Paste and deploy**

### 2. Set Environment Variables ⚠️ **REQUIRED**

Go to **Edge Functions** → **Settings** → **Environment Variables**

Add these 4 variables:

| Variable | Value |
|----------|-------|
| `STRIPE_RESTRICTED_KEY` | `rk_test_51QAQyCClUqvgxZvpKaTgchHG8wvTU069VUU1yrF7slV03H9htAgNJOCjgbS3DpLZAN4r9eLseB8njvy1xUVCoBlE003Y4K4ytP` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_Mf6471Fw5xGEIQt0lPi3YlYYxcemrcgS` |
| `SUPABASE_URL` | `https://ofutzrxfbrgtbkyafndv.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key (Settings → API → service_role key) |

### 3. Verify Webhook Endpoint in Stripe ✅

1. Go to **Stripe Dashboard** → **Developers** → **Webhooks**
2. Verify endpoint URL: `https://ofutzrxfbrgtbkyafndv.supabase.co/functions/v1/stripe-webhook`
3. Verify events are selected (see WEBHOOK_SETUP.md for full list)

### 4. Test It! 🧪

1. Make a test payment
2. Check Supabase Edge Function logs
3. Check database:
   ```sql
   -- Check subscription was updated
   SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';
   
   -- Check payment was recorded
   SELECT * FROM payment_history WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC;
   
   -- Check webhook events
   SELECT * FROM stripe_webhook_events ORDER BY created_at DESC LIMIT 10;
   ```

## What Happens When Payment Succeeds

1. ✅ Stripe sends webhook to your Edge Function
2. ✅ Webhook verifies signature using `STRIPE_WEBHOOK_SECRET`
3. ✅ Updates `subscriptions` table:
   - Sets `subscription_type = 'paid'`
   - Sets `status = 'active'`
   - Updates `plan_id`
   - Sets Stripe IDs and dates
4. ✅ Records payment in `payment_history` table
5. ✅ Stores webhook event in `stripe_webhook_events` table
6. ✅ Logs email to send (email service can be implemented later)

## Troubleshooting

### Webhook Not Working?
- ✅ Check `STRIPE_WEBHOOK_SECRET` matches exactly: `whsec_Mf6471Fw5xGEIQt0lPi3YlYYxcemrcgS`
- ✅ Check Edge Function is deployed
- ✅ Check Edge Function logs for errors
- ✅ Verify webhook endpoint URL in Stripe matches your Supabase URL

### Database Not Updating?
- ✅ Check `SUPABASE_SERVICE_KEY` is correct (service role key, not anon key)
- ✅ Check `SUPABASE_URL` is correct
- ✅ Check Edge Function logs for database errors
- ✅ Verify `userId` is in Stripe customer metadata

## Files Reference

- **Webhook Handler**: `payments/backend/supabase-edge-function/stripe-webhook.ts`
- **Full Setup Guide**: `payments/WEBHOOK_SETUP.md`
- **Complete Overview**: `payments/UPGRADE_AND_WEBHOOKS.md`

