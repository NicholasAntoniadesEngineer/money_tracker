# Stripe Payment Integration

This folder contains the Stripe payment integration for the Money Tracker application.

## Configuration

### Stripe Keys

The application uses the following Stripe keys (configured in `config/stripe-config.js`):

- **Publishable Key** (`pk_test_...`): Used client-side to initialize Stripe.js
- **Secret Key** (`sk_test_...`): For server-side operations (should NEVER be exposed client-side)
- **Restricted Key** (`rk_test_...`): For server-side operations with limited permissions (recommended for production)

### Important Security Note

**NEVER expose the secret key or restricted key in client-side code.** These keys should only be used in:
- Supabase Edge Functions
- Separate backend server
- Server-side API endpoints

## Backend Endpoint Setup

To enable subscription payments, you need to create a backend endpoint that creates Stripe Checkout sessions. Here's an example using a Supabase Edge Function:

### Supabase Edge Function Example

Create a new Edge Function in Supabase (e.g., `create-checkout-session`):

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_RESTRICTED_KEY") || Deno.env.get("STRIPE_SECRET_KEY"), {
  apiVersion: "2023-10-16",
})

serve(async (req) => {
  try {
    const { customerEmail, userId, successUrl, cancelUrl } = await req.json()

    const session = await stripe.checkout.sessions.create({
      customer_email: customerEmail,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Money Tracker Monthly Subscription",
            },
            unit_amount: 500, // 5 EUR in cents
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId,
      },
    })

    return new Response(
      JSON.stringify({ sessionId: session.id }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }
})
```

### Environment Variables

Set the following environment variables in your Supabase project:
- `STRIPE_RESTRICTED_KEY`: Your restricted key (rk_test_...)
- Or `STRIPE_SECRET_KEY`: Your secret key (sk_test_...) if not using restricted key

### Update PaymentController

After creating the backend endpoint, update `PaymentController.js` to use it:

```javascript
const backendEndpoint = 'https://your-project.supabase.co/functions/v1/create-checkout-session';

const result = await window.StripeService.createCheckoutSession(
    currentUser.email,
    currentUser.id,
    successUrl,
    cancelUrl,
    backendEndpoint  // Pass the backend endpoint
);
```

## Features

### Trial Management
- Automatic 30-day trial on user signup
- Trial status tracked in `subscriptions` table
- Access granted during trial period
- Automatic expiration after 30 days

### Subscription Management
- Recurring monthly subscription (5 EUR/month)
- Stripe handles automatic renewals
- Subscription status synced with database
- Payment history tracked in `payment_history` table

### Access Control
- AuthGuard checks subscription status before allowing access
- Redirects to payment page if access expired
- Clear messaging about trial/subscription status

## Database Tables

### subscriptions
Tracks user subscription status, trial periods, and payment dates.

### payment_history
Logs all payment transactions with status, amount, and Stripe payment intent ID.

## Testing

Use Stripe test mode cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

See [Stripe Testing Documentation](https://stripe.com/docs/testing) for more test cards.

