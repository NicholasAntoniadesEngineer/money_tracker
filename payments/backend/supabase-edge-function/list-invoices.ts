/**
 * Supabase Edge Function: list-invoices
 * 
 * This function lists invoices for a Stripe customer.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. In Supabase Dashboard, go to Edge Functions
 * 2. Click "Create a new function"
 * 3. Name it: list-invoices
 * 4. Copy the code from this file into the function
 * 5. Set environment variable: STRIPE_RESTRICTED_KEY = your_stripe_restricted_key_here
 * 6. Deploy the function
 * 
 * USAGE:
 * POST https://your-project.supabase.co/functions/v1/list-invoices
 * Headers: { 
 *   "Content-Type": "application/json",
 *   "Authorization": "Bearer <user_access_token>"
 * }
 * Body: {
 *   "customerId": "cus_xxxxx",
 *   "limit": 10
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
    console.log("[list-invoices] ========== REQUEST RECEIVED ==========")
    const startTime = Date.now()
    
    // Parse request body
    console.log("[list-invoices] Step 1: Parsing request body...")
    const { customerId, limit = 10 } = await req.json()
    console.log("[list-invoices] Request data:", { customerId, limit })

    // Validate required fields
    console.log("[list-invoices] Step 2: Validating input...")
    if (!customerId) {
      console.error("[list-invoices] ❌ customerId is required")
      return new Response(
        JSON.stringify({ error: "customerId is required" }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }
    console.log("[list-invoices] ✅ Input validated")

    // List invoices from Stripe
    console.log("[list-invoices] Step 3: Fetching invoices from Stripe...")
    const invoicesStartTime = Date.now()
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: Math.min(limit, 100), // Max 100 invoices
      expand: ['data.payment_intent']
    })
    const invoicesElapsed = Date.now() - invoicesStartTime
    console.log("[list-invoices] ✅ Invoices fetched:", {
      count: invoices.data.length,
      elapsed: `${invoicesElapsed}ms`
    })

    // Format invoices for response
    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      amount_paid: invoice.amount_paid / 100, // Convert from cents
      currency: invoice.currency.toUpperCase(),
      status: invoice.status,
      created: new Date(invoice.created * 1000).toISOString(),
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      description: invoice.description || invoice.lines.data[0]?.description || 'Subscription payment',
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    }))

    const totalElapsed = Date.now() - startTime
    console.log("[list-invoices] ========== REQUEST SUCCESS ==========")
    console.log("[list-invoices] Total invoices:", formattedInvoices.length)
    console.log("[list-invoices] Total time:", `${totalElapsed}ms`)

    // Return invoices
    return new Response(
      JSON.stringify({ 
        success: true,
        invoices: formattedInvoices,
        count: formattedInvoices.length
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
    console.error("[list-invoices] ========== REQUEST ERROR ==========")
    console.error("[list-invoices] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || "Failed to list invoices",
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

