/**
 * Supabase Edge Function: create-checkout-session
 * 
 * This function creates a Stripe Checkout session for monthly subscriptions.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. In Supabase Dashboard, go to Edge Functions
 * 2. Click "Create a new function"
 * 3. Name it: create-checkout-session
 * 4. Copy the code from this file into the function
 * 5. Set environment variable: STRIPE_RESTRICTED_KEY = rk_test_51QAQyCClUqvgxZvpKaTgchHG8wvTU069VUU1yrF7slV03H9htAgNJOCjgbS3DpLZAN4r9eLseB8njvy1xUVCoBlE003Y4K4ytP
 * 6. Deploy the function
 * 
 * USAGE:
 * POST https://your-project.supabase.co/functions/v1/create-checkout-session
 * Headers: { "Content-Type": "application/json" }
 * Body: {
 *   "customerEmail": "user@example.com",
 *   "userId": "user-uuid",
 *   "successUrl": "https://your-app.com/payment?payment=success",
 *   "cancelUrl": "https://your-app.com/payment?payment=cancelled"
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

// Initialize Stripe with restricted key (safer) or secret key (fallback)
const stripeKey = Deno.env.get("STRIPE_RESTRICTED_KEY") || Deno.env.get("STRIPE_SECRET_KEY")

if (!stripeKey) {
  throw new Error("STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY environment variable is required")
}

const stripe = new Stripe(stripeKey, {
  apiVersion: "2023-10-16",
})

// Subscription configuration
const SUBSCRIPTION_PRICE_AMOUNT = 500 // 5 EUR in cents
const SUBSCRIPTION_CURRENCY = "eur"
const SUBSCRIPTION_INTERVAL = "month"

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { 
        status: 405,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    )
  }

  try {
    // Parse request body
    const { customerEmail, userId, successUrl, cancelUrl } = await req.json()

    // Validate required fields
    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "customerEmail is required" }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    if (!successUrl || !cancelUrl) {
      return new Response(
        JSON.stringify({ error: "successUrl and cancelUrl are required" }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: customerEmail,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: SUBSCRIPTION_CURRENCY,
            product_data: {
              name: "Money Tracker Monthly Subscription",
              description: "Monthly access to Money Tracker application",
            },
            unit_amount: SUBSCRIPTION_PRICE_AMOUNT,
            recurring: {
              interval: SUBSCRIPTION_INTERVAL,
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
        customerEmail: customerEmail,
      },
      // Allow promotion codes
      allow_promotion_codes: true,
    })

    // Return session ID
    return new Response(
      JSON.stringify({ 
        sessionId: session.id,
        url: session.url, // Optional: direct checkout URL
      }),
      { 
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    )
  } catch (error) {
    console.error("Error creating checkout session:", error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to create checkout session",
        details: error.toString(),
      }),
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    )
  }
})

