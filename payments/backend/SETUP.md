# Stripe Payment Setup - Complete Guide

## Quick Setup (4 Steps)

### 1. Create Supabase Edge Function
- Go to Supabase Dashboard → **Edge Functions** → **Create new function**
- Name: `create-checkout-session`
- Copy code from: `payments/backend/supabase-edge-function/index.ts`
- Paste and click **Deploy**

### 2. Set Environment Variable
- Edge Functions → **Settings** → **Environment Variables**
- Add: `STRIPE_RESTRICTED_KEY` = `rk_test_51QAQyCClUqvgxZvpKaTgchHG8wvTU069VUU1yrF7slV03H9htAgNJOCjgbS3DpLZAN4r9eLseB8njvy1xUVCoBlE003Y4K4ytP`

### 3. Update PaymentController (Already Done)
- File: `payments/controllers/PaymentController.js` (line ~240)
- Already configured with your project URL: `https://ofutzrxfbrgtbkyafndv.supabase.co`
- No changes needed unless your project URL is different

### 4. Test
- Log in → Go to payment page → Click "Start Subscription"
- Should redirect to Stripe Checkout
- Use test card: `4242 4242 4242 4242` (any future date, any CVC)

## Edge Function Code Location
`payments/backend/supabase-edge-function/index.ts` - Copy entire file contents

## Troubleshooting
- **404 Error**: Check function name is exactly `create-checkout-session` and is deployed
- **500 Error**: Check Edge Function logs in Supabase dashboard
- **Wrong URL**: Verify project URL in PaymentController matches your Supabase project

## Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

