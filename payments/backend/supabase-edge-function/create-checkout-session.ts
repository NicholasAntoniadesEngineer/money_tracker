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
    console.log("[create-checkout-session] ========== REQUEST RECEIVED ==========")
    const startTime = Date.now()
    
    // Parse request body
    console.log("[create-checkout-session] Step 1: Parsing request body...")
    const { customerEmail, userId, successUrl, cancelUrl } = await req.json()
    console.log("[create-checkout-session] Request data:", { customerEmail, userId, successUrl, cancelUrl })

    // Validate required fields
    console.log("[create-checkout-session] Step 2: Validating input...")
    if (!customerEmail) {
      console.error("[create-checkout-session] ❌ customerEmail is required")
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
      console.error("[create-checkout-session] ❌ userId is required")
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
      console.error("[create-checkout-session] ❌ successUrl and cancelUrl are required")
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
    console.log("[create-checkout-session] ✅ Input validated")

    // Get or create Stripe customer
    console.log("[create-checkout-session] Step 3: Getting or creating Stripe customer...")
    let customer;
    const listStartTime = Date.now()
    const existingCustomers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });
    const listElapsed = Date.now() - listStartTime
    console.log("[create-checkout-session] Customer list query:", {
      found: existingCustomers.data.length > 0,
      count: existingCustomers.data.length,
      elapsed: `${listElapsed}ms`
    })
    
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log("[create-checkout-session] ✅ Using existing customer:", customer.id)
    } else {
      console.log("[create-checkout-session] Creating new customer...")
      const createStartTime = Date.now()
      customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          userId: userId,
        },
      });
      const createElapsed = Date.now() - createStartTime
      console.log("[create-checkout-session] ✅ Customer created:", {
        customerId: customer.id,
        email: customer.email,
        elapsed: `${createElapsed}ms`
      })
    }

    // Create Stripe Checkout session
    console.log("[create-checkout-session] Step 4: Creating Stripe Checkout session...")
    const checkoutStartTime = Date.now()
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,  // Use customer ID instead of customer_email
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
        customerId: customer.id,  // Include customer ID in metadata
      },
      // Allow promotion codes
      allow_promotion_codes: true,
    })
    const checkoutElapsed = Date.now() - checkoutStartTime
    console.log("[create-checkout-session] ✅ Checkout session created:", {
      sessionId: session.id,
      url: session.url,
      customerId: customer.id,
      elapsed: `${checkoutElapsed}ms`
    })

    const totalElapsed = Date.now() - startTime
    console.log("[create-checkout-session] ========== REQUEST SUCCESS ==========")
    console.log("[create-checkout-session] Session ID:", session.id)
    console.log("[create-checkout-session] Customer ID:", customer.id)
    console.log("[create-checkout-session] Total time:", `${totalElapsed}ms`)

    // Return session ID and customer ID
    return new Response(
      JSON.stringify({ 
        sessionId: session.id,
        customerId: customer.id,  // Return customer ID so frontend can store it
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
    console.error("[create-checkout-session] ========== REQUEST ERROR ==========")
    console.error("[create-checkout-session] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
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

