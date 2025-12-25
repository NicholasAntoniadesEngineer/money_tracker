/**
 * Supabase Edge Function: update-subscription
 * 
 * Handles subscription changes (upgrades/downgrades) and recurring billing toggles
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. In Supabase Dashboard, go to Edge Functions
 * 2. Click "Create a new function"
 * 3. Name it: update-subscription
 * 4. Copy the code from this file into the function
 * 5. Set environment variables:
 *    - STRIPE_RESTRICTED_KEY = your Stripe restricted/secret key
 *    - SUPABASE_URL = your Supabase project URL
 *    - SUPABASE_SERVICE_KEY = your Supabase service role key
 * 6. Deploy the function
 * 
 * USAGE:
 * POST https://your-project.supabase.co/functions/v1/update-subscription
 * Headers: { "Content-Type": "application/json", "Authorization": "Bearer <token>" }
 * Body: {
 *   "userId": "user-uuid",
 *   "planId": 3,  // Optional: new plan ID
 *   "changeType": "upgrade" | "downgrade",  // Optional: type of change
 *   "recurringBillingEnabled": true  // Optional: toggle recurring billing
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno"

// Initialize Stripe
let stripe: Stripe | null = null

try {
  const stripeKey = Deno.env.get("STRIPE_RESTRICTED_KEY") || Deno.env.get("STRIPE_SECRET_KEY")
  
  if (!stripeKey) {
    console.warn("[update-subscription] ⚠️ STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY not set - will fail on POST requests")
  } else {
    stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
    })
    console.log("[update-subscription] ✅ Stripe initialized successfully")
  }
} catch (initError) {
  console.error("[update-subscription] ❌ Stripe initialization error:", initError)
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY")

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[update-subscription] ⚠️ SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
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
    console.error("[update-subscription] ❌ Stripe not initialized - check environment variables")
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

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error: Supabase credentials not set" }),
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
    console.log("[update-subscription] ========== REQUEST RECEIVED ==========")
    const startTime = Date.now()
    
    // Parse request body
    const { userId, planId, changeType, recurringBillingEnabled } = await req.json()
    console.log("[update-subscription] Request data:", { userId, planId, changeType, recurringBillingEnabled })

    // Validate required fields
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

    // Get current subscription from database
    const subscriptionResponse = await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=*`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    })

    if (!subscriptionResponse.ok) {
      throw new Error(`Failed to fetch subscription: ${await subscriptionResponse.text()}`)
    }

    const subscriptions = await subscriptionResponse.json()
    const currentSubscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null

    if (!currentSubscription || !currentSubscription.stripe_subscription_id) {
      return new Response(
        JSON.stringify({ error: "No active subscription found for user" }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    const stripeSubscriptionId = currentSubscription.stripe_subscription_id
    const stripeCustomerId = currentSubscription.stripe_customer_id

    // Handle recurring billing toggle
    if (recurringBillingEnabled !== undefined && recurringBillingEnabled !== null) {
      console.log(`[update-subscription] Toggling recurring billing to: ${recurringBillingEnabled}`)
      
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: !recurringBillingEnabled
      })

      // Update database
      await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          recurring_billing_enabled: recurringBillingEnabled,
          updated_at: new Date().toISOString()
        })
      })

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Recurring billing ${recurringBillingEnabled ? 'enabled' : 'disabled'}`,
          recurring_billing_enabled: recurringBillingEnabled
        }),
        { 
          status: 200,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    // Handle plan changes (upgrade/downgrade)
    if (planId !== undefined && planId !== null) {
      console.log(`[update-subscription] Processing plan change to planId: ${planId}, changeType: ${changeType}`)

      // Get plan details from database
      const planResponse = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?id=eq.${planId}&select=*`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      })

      if (!planResponse.ok) {
        throw new Error(`Failed to fetch plan: ${await planResponse.text()}`)
      }

      const plans = await planResponse.json()
      const newPlan = plans && plans.length > 0 ? plans[0] : null

      if (!newPlan) {
        return new Response(
          JSON.stringify({ error: `Plan with id ${planId} not found` }),
          { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            } 
          }
        )
      }

      // Determine if this is an upgrade or downgrade
      const currentPlanId = currentSubscription.plan_id
      const currentPlanPrice = currentPlanId ? await getPlanPrice(currentPlanId) : 0
      const newPlanPrice = newPlan.price_amount || 0
      const isUpgrade = !currentPlanId || newPlanPrice > currentPlanPrice
      const isDowngrade = currentPlanId && newPlanPrice < currentPlanPrice
      const finalChangeType = changeType || (isUpgrade ? 'upgrade' : isDowngrade ? 'downgrade' : null)

      console.log(`[update-subscription] Change type determined: ${finalChangeType}`, {
        currentPlanId,
        newPlanId: planId,
        currentPrice: currentPlanPrice,
        newPrice: newPlanPrice
      })

      // Get Stripe subscription details
      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)

      if (finalChangeType === 'upgrade') {
        // Immediate upgrade: cancel current, create new with proration
        console.log("[update-subscription] Processing immediate upgrade...")
        
        // Cancel current subscription immediately
        await stripe.subscriptions.update(stripeSubscriptionId, {
          cancel_at_period_end: false
        })

        // Get Stripe Price ID for new plan
        const newPriceId = newPlan.stripe_price_id
        if (!newPriceId) {
          return new Response(
            JSON.stringify({ error: `Plan ${planId} does not have a Stripe Price ID configured` }),
            { 
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              } 
            }
          )
        }

        // Create new subscription with proration
        const newSubscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: newPriceId }],
          proration_behavior: 'create_prorations',
          metadata: {
            userId: userId,
            planId: planId.toString(),
            changeType: 'upgrade'
          }
        })

        console.log("[update-subscription] ✅ New subscription created:", newSubscription.id)

        // Update database - webhook will handle full update, but we can set plan_id immediately
        await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            plan_id: parseInt(planId),
            change_type: 'upgrade',
            pending_plan_id: null,
            pending_change_date: null,
            updated_at: new Date().toISOString()
          })
        })

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Subscription upgraded successfully",
            subscriptionId: newSubscription.id,
            planId: parseInt(planId)
          }),
          { 
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            } 
          }
        )

      } else if (finalChangeType === 'downgrade') {
        // Scheduled downgrade: cancel at period end, set pending plan
        console.log("[update-subscription] Processing scheduled downgrade...")

        // Get Stripe Price ID for new plan
        const newPriceId = newPlan.stripe_price_id
        if (!newPriceId) {
          return new Response(
            JSON.stringify({ error: `Plan ${planId} does not have a Stripe Price ID configured` }),
            { 
              status: 400,
              headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              } 
            }
          )
        }

        // Schedule cancellation at period end
        await stripe.subscriptions.update(stripeSubscriptionId, {
          cancel_at_period_end: true,
          metadata: {
            ...stripeSubscription.metadata,
            pendingPlanId: planId.toString(),
            changeType: 'downgrade'
          }
        })

        // Calculate when the change will take effect (end of current period)
        const changeDate = new Date(stripeSubscription.current_period_end * 1000).toISOString()

        // Update database with pending change
        await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            pending_plan_id: parseInt(planId),
            pending_change_date: changeDate,
            change_type: 'downgrade',
            updated_at: new Date().toISOString()
          })
        })

        console.log("[update-subscription] ✅ Downgrade scheduled for:", changeDate)

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Downgrade scheduled for end of billing period",
            pendingPlanId: parseInt(planId),
            changeDate: changeDate
          }),
          { 
            status: 200,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            } 
          }
        )
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid change type or no price difference detected" }),
          { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            } 
          }
        )
      }
    }

    // If no plan change or recurring billing toggle, return error
    return new Response(
      JSON.stringify({ error: "Either planId or recurringBillingEnabled must be provided" }),
      { 
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    )

  } catch (error) {
    console.error("[update-subscription] ========== REQUEST ERROR ==========")
    console.error("[update-subscription] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Failed to update subscription",
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

/**
 * Helper function to get plan price from database
 */
async function getPlanPrice(planId: number): Promise<number> {
  if (!supabaseUrl || !supabaseServiceKey) {
    return 0
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?id=eq.${planId}&select=price_amount`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    })

    if (response.ok) {
      const plans = await response.json()
      if (plans && plans.length > 0) {
        return parseFloat(plans[0].price_amount) || 0
      }
    }
  } catch (error) {
    console.error("[update-subscription] Error fetching plan price:", error)
  }

  return 0
}

