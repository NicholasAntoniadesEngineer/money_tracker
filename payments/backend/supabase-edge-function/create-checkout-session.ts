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
 * 5. Set environment variable: STRIPE_RESTRICTED_KEY = your_stripe_restricted_key_here
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
// Note: This initialization happens at module load time, but errors won't affect OPTIONS requests
let stripe: Stripe | null = null

try {
  const stripeKey = Deno.env.get("STRIPE_RESTRICTED_KEY") || Deno.env.get("STRIPE_SECRET_KEY")
  
  if (!stripeKey) {
    console.warn("[create-checkout-session] ⚠️ STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY not set - will fail on POST requests")
  } else {
    stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
    })
    console.log("[create-checkout-session] ✅ Stripe initialized successfully")
  }
} catch (initError) {
  console.error("[create-checkout-session] ❌ Stripe initialization error:", initError)
  // Don't throw - allow OPTIONS requests to work even if Stripe init fails
}

// Subscription configuration
const SUBSCRIPTION_PRICE_AMOUNT = 500 // 5 EUR in cents
const SUBSCRIPTION_CURRENCY = "eur"
const SUBSCRIPTION_INTERVAL = "month"

serve(async (req) => {
  // Handle CORS preflight requests - MUST return 200 status explicitly
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
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

  // Check if Stripe is initialized
  if (!stripe) {
    console.error("[create-checkout-session] ❌ Stripe not initialized - check environment variables")
    return new Response(
      JSON.stringify({ error: "Server configuration error: Stripe not initialized" }),
      { 
        status: 500,
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
    const { customerEmail, userId, successUrl, cancelUrl, planId, priceAmount } = await req.json()
    console.log("[create-checkout-session] Request data:", { customerEmail, userId, successUrl, cancelUrl, planId, priceAmount })

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

    // Check for existing active subscriptions and cancel them
    // This ensures only one active subscription per user
    console.log("[create-checkout-session] Step 3.5: Checking for existing subscriptions...")
    const existingSubscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 10
    })
    
    if (existingSubscriptions.data.length > 0) {
      console.log(`[create-checkout-session] Found ${existingSubscriptions.data.length} active subscription(s), cancelling...`)
      for (const subscription of existingSubscriptions.data) {
        try {
          await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: false  // Cancel immediately
          })
          console.log(`[create-checkout-session] ✅ Cancelled existing subscription: ${subscription.id}`)
        } catch (cancelError) {
          console.error(`[create-checkout-session] ⚠️ Error cancelling subscription ${subscription.id}:`, cancelError.message)
          // Continue - try to cancel others even if one fails
        }
      }
    } else {
      console.log("[create-checkout-session] No existing active subscriptions found")
    }

    // Create Stripe Checkout session
    console.log("[create-checkout-session] Step 4: Creating Stripe Checkout session...")
    
    // Determine price and plan details
    const finalPriceAmount = priceAmount || SUBSCRIPTION_PRICE_AMOUNT
    const priceInEuros = (finalPriceAmount / 100).toFixed(2)
    console.log("[create-checkout-session] Using price:", { 
      priceAmount: finalPriceAmount, 
      priceInEuros: `${priceInEuros} EUR`,
      planId: planId || 'default'
    })
    
    // Determine change type (upgrade if existing subscription, new if none)
    const changeType = existingSubscriptions.data.length > 0 ? 'upgrade' : null
    
    const checkoutStartTime = Date.now()
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,  // Use customer ID instead of customer_email
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: SUBSCRIPTION_CURRENCY,
            product_data: {
              name: planId ? `Money Tracker Subscription (Plan ${planId})` : "Money Tracker Monthly Subscription",
              description: `Monthly access to Money Tracker application - €${priceInEuros}/month`,
            },
            unit_amount: finalPriceAmount,
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
        planId: planId || '',  // Include plan ID if provided
        changeType: changeType || '',  // Include change type if upgrade
      },
      subscription_data: {
        metadata: {
          userId: userId,
          planId: planId || '',
          changeType: changeType || ''
        },
        // Enable proration for upgrades (Stripe will handle this automatically)
        proration_behavior: changeType === 'upgrade' ? 'create_prorations' : undefined
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

