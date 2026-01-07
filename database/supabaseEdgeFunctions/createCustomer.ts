/**
 * Supabase Edge Function: create-customer
 * 
 * This function creates a Stripe customer for users who want to add a payment method
 * but don't have a customer ID yet (e.g., trial users).
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. In Supabase Dashboard, go to Edge Functions
 * 2. Click "Create a new function"
 * 3. Name it: create-customer
 * 4. Copy the code from this file into the function
 * 5. Set environment variable: STRIPE_RESTRICTED_KEY = your_stripe_restricted_key_here
 * 6. Deploy the function
 * 
 * USAGE:
 * POST https://your-project.supabase.co/functions/v1/create-customer
 * Headers: { "Content-Type": "application/json" }
 * Body: {
 *   "customerEmail": "user@example.com",
 *   "userId": "user-uuid"
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
    console.log("[create-customer] ========== REQUEST RECEIVED ==========")
    const startTime = Date.now()
    
    // Parse request body
    console.log("[create-customer] Step 1: Parsing request body...")
    const { customerEmail, userId } = await req.json()
    console.log("[create-customer] Request data:", { customerEmail, userId })

    // Validate required fields
    console.log("[create-customer] Step 2: Validating input...")
    if (!customerEmail) {
      console.error("[create-customer] ❌ customerEmail is required")
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
    console.log("[create-customer] ✅ Input validated")

    // Check if customer already exists
    console.log("[create-customer] Step 3: Checking for existing customer...")
    const listStartTime = Date.now()
    const existingCustomers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    })
    const listElapsed = Date.now() - listStartTime
    console.log("[create-customer] Customer list query:", {
      found: existingCustomers.data.length > 0,
      count: existingCustomers.data.length,
      elapsed: `${listElapsed}ms`
    })
    
    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0]
      console.log("[create-customer] ✅ Using existing customer:", customer.id)
    } else {
      // Create new Stripe customer
      console.log("[create-customer] Step 4: Creating new Stripe customer...")
      const createStartTime = Date.now()
      customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          userId: userId || '',
        },
      })
      const createElapsed = Date.now() - createStartTime
      console.log("[create-customer] ✅ Customer created:", {
        customerId: customer.id,
        email: customer.email,
        elapsed: `${createElapsed}ms`
      })
    }

    const totalElapsed = Date.now() - startTime
    console.log("[create-customer] ========== REQUEST SUCCESS ==========")
    console.log("[create-customer] Customer ID:", customer.id)
    console.log("[create-customer] Total time:", `${totalElapsed}ms`)

    // Return customer ID
    return new Response(
      JSON.stringify({ 
        customerId: customer.id,
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
    console.error("[create-customer] ========== REQUEST ERROR ==========")
    console.error("[create-customer] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to create customer",
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

