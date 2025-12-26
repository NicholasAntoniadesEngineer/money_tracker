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
 *    Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are available by default in Edge Functions
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

// Use default Supabase secrets available in Edge Functions
const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[update-subscription] ⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not available")
  console.warn("[update-subscription] Available env vars:", {
    hasSupabaseUrl: !!Deno.env.get("SUPABASE_URL"),
    hasSupabaseServiceRoleKey: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    allEnvKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes("SUPABASE"))
  })
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
    console.error("[update-subscription] Missing Supabase credentials:", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      urlValue: supabaseUrl ? "***" : "missing",
      serviceKeyValue: supabaseServiceKey ? "***" : "missing"
    })
    return new Response(
      JSON.stringify({ 
        error: "Server configuration error: Supabase credentials not available",
        details: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY should be available by default in Edge Functions. Please check Edge Function logs."
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

  try {
    console.log("[update-subscription] ========== REQUEST RECEIVED ==========")
    const startTime = Date.now()
    
    // Parse request body
    const { userId, planId, changeType, recurringBillingEnabled, syncDates } = await req.json()
    console.log("[update-subscription] Request data:", { userId, planId, changeType, recurringBillingEnabled, syncDates })

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
    console.log(`[update-subscription] Fetching subscription for user: ${userId}`)
    const subscriptionResponse = await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=*`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    })

    if (!subscriptionResponse.ok) {
      const errorText = await subscriptionResponse.text()
      console.error(`[update-subscription] Failed to fetch subscription: ${errorText}`)
      throw new Error(`Failed to fetch subscription: ${errorText}`)
    }

    const subscriptions = await subscriptionResponse.json()
    console.log(`[update-subscription] Found ${subscriptions?.length || 0} subscription(s)`)
    const currentSubscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null

    if (!currentSubscription) {
      console.error(`[update-subscription] No subscription found for user ${userId}`)
      return new Response(
        JSON.stringify({ error: "No subscription found for user" }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      )
    }

    console.log(`[update-subscription] Current subscription:`, {
      id: currentSubscription.id,
      plan_id: currentSubscription.plan_id,
      subscription_type: currentSubscription.subscription_type,
      status: currentSubscription.status,
      has_stripe_subscription_id: !!currentSubscription.stripe_subscription_id,
      has_stripe_customer_id: !!currentSubscription.stripe_customer_id,
      recurring_billing_enabled: currentSubscription.recurring_billing_enabled
    })

    // If syncDates is true, fetch subscription dates from Stripe and update database
    if (syncDates === true) {
      console.log("[update-subscription] ========== SYNCING SUBSCRIPTION DATES ==========")
      console.log("[update-subscription] Sync request details:", {
        userId: userId,
        hasStripeSubscriptionId: !!currentSubscription.stripe_subscription_id,
        hasStripeCustomerId: !!currentSubscription.stripe_customer_id,
        stripeSubscriptionId: currentSubscription.stripe_subscription_id || 'null',
        stripeCustomerId: currentSubscription.stripe_customer_id || 'null',
        subscriptionType: currentSubscription.subscription_type,
        status: currentSubscription.status
      })
      
      let stripeSubscriptionId = currentSubscription.stripe_subscription_id
      
      // If we don't have stripe_subscription_id but have customer_id, try to find it
      if (!stripeSubscriptionId && currentSubscription.stripe_customer_id) {
        console.log("[update-subscription] ⚠️ No stripe_subscription_id found, attempting to look up using customer ID...")
        console.log("[update-subscription] Looking up subscriptions for customer:", currentSubscription.stripe_customer_id)
        
        try {
          // Look up active subscriptions for this customer in Stripe
          const stripeSubscriptions = await stripe.subscriptions.list({
            customer: currentSubscription.stripe_customer_id,
            status: 'active',
            limit: 1
          })
          
          console.log("[update-subscription] Stripe subscriptions lookup result:", {
            found: stripeSubscriptions.data.length,
            subscriptions: stripeSubscriptions.data.map(s => ({ id: s.id, status: s.status }))
          })
          
          if (stripeSubscriptions.data.length > 0) {
            const foundSubscription = stripeSubscriptions.data[0]
            stripeSubscriptionId = foundSubscription.id
            console.log("[update-subscription] ✅ Found Stripe subscription:", stripeSubscriptionId)
            
            // Update database with the found subscription ID
            const updateSubIdResponse = await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "apikey": supabaseServiceKey,
                "Authorization": `Bearer ${supabaseServiceKey}`,
                "Prefer": "return=representation"
              },
              body: JSON.stringify({
                stripe_subscription_id: stripeSubscriptionId,
                updated_at: new Date().toISOString()
              })
            })
            
            if (updateSubIdResponse.ok) {
              console.log("[update-subscription] ✅ Synced Stripe subscription ID to database")
            } else {
              const errorText = await updateSubIdResponse.text()
              console.warn("[update-subscription] ⚠️ Failed to update stripe_subscription_id in database:", errorText)
            }
          } else {
            console.error("[update-subscription] ❌ No active Stripe subscription found for customer", currentSubscription.stripe_customer_id)
            return new Response(
              JSON.stringify({ 
                error: "No active Stripe subscription found. The subscription may still be processing.",
                details: {
                  customer_id: currentSubscription.stripe_customer_id,
                  subscription_type: currentSubscription.subscription_type,
                  status: currentSubscription.status
                }
              }),
              { 
                status: 404,
                headers: { 
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                } 
              }
            )
          }
        } catch (lookupError) {
          console.error("[update-subscription] ❌ Error looking up Stripe subscription:", lookupError)
          return new Response(
            JSON.stringify({ 
              error: "Failed to look up Stripe subscription. Please try again in a moment.",
              details: lookupError.message
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
      }
      
      if (!stripeSubscriptionId) {
        console.error("[update-subscription] ❌ Cannot sync dates: No stripe_subscription_id and no stripe_customer_id")
        return new Response(
          JSON.stringify({ 
            error: "No Stripe subscription ID found and cannot look up using customer ID. Cannot sync dates.",
            details: {
              hasStripeSubscriptionId: false,
              hasStripeCustomerId: false
            }
          }),
          { 
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            } 
          }
        )
      }
      
      try {
        console.log("[update-subscription] Fetching subscription from Stripe using ID:", stripeSubscriptionId)
        // Fetch subscription from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
        
        console.log("[update-subscription] ✅ Stripe subscription retrieved:", {
          id: stripeSubscription.id,
          current_period_start: stripeSubscription.current_period_start,
          current_period_start_date: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
          current_period_end: stripeSubscription.current_period_end,
          current_period_end_date: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          status: stripeSubscription.status,
          hasItems: stripeSubscription.items?.data?.length > 0,
          priceId: stripeSubscription.items?.data?.[0]?.price?.id || 'none'
        })
        
        // Update database with dates from Stripe
        const updateData = {
          subscription_start_date: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
          subscription_end_date: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          next_billing_date: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
          stripe_price_id: stripeSubscription.items.data[0]?.price?.id || currentSubscription.stripe_price_id,
          updated_at: new Date().toISOString()
        }
        
        console.log("[update-subscription] Updating database with dates:", updateData)
        
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Prefer": "return=representation"
          },
          body: JSON.stringify(updateData)
        })
        
        console.log("[update-subscription] Database update response status:", updateResponse.status)
        
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          console.error("[update-subscription] ❌ Database update failed:", errorText)
          throw new Error(`Failed to update subscription dates: ${errorText}`)
        }
        
        const updatedSubscription = await updateResponse.json()
        const finalSubscription = updatedSubscription[0] || updatedSubscription
        
        console.log("[update-subscription] ✅ Subscription dates synced successfully")
        console.log("[update-subscription] Updated subscription dates:", {
          subscription_start_date: finalSubscription.subscription_start_date,
          subscription_end_date: finalSubscription.subscription_end_date,
          next_billing_date: finalSubscription.next_billing_date
        })
        
        return new Response(
          JSON.stringify({ 
            success: true,
            message: "Subscription dates synced from Stripe",
            updatedDates: {
              subscription_start_date: finalSubscription.subscription_start_date,
              subscription_end_date: finalSubscription.subscription_end_date,
              next_billing_date: finalSubscription.next_billing_date
            },
            subscription: finalSubscription
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
        console.error("[update-subscription] ❌ Error syncing dates:", error)
        console.error("[update-subscription] Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name
        })
        return new Response(
          JSON.stringify({ 
            error: `Failed to sync dates: ${error.message}`,
            details: error.stack
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
    }
    
    // For recurring billing toggle, we need a Stripe subscription
    if (recurringBillingEnabled !== undefined && recurringBillingEnabled !== null) {
      if (!currentSubscription.stripe_subscription_id) {
        // If subscription_type is "paid" but no stripe_subscription_id, try to find it in Stripe
        if (currentSubscription.subscription_type === "paid" && currentSubscription.stripe_customer_id) {
          console.log(`[update-subscription] Paid subscription without Stripe subscription ID - attempting to find in Stripe...`)
          
          try {
            // Look up active subscriptions for this customer in Stripe
            const stripeSubscriptions = await stripe.subscriptions.list({
              customer: currentSubscription.stripe_customer_id,
              status: 'active',
              limit: 1
            })
            
            if (stripeSubscriptions.data.length > 0) {
              const foundSubscription = stripeSubscriptions.data[0]
              console.log(`[update-subscription] Found Stripe subscription: ${foundSubscription.id}`)
              
              // Update database with the found subscription ID
              await fetch(`${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${userId}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  "apikey": supabaseServiceKey,
                  "Authorization": `Bearer ${supabaseServiceKey}`,
                  "Prefer": "return=representation"
                },
                body: JSON.stringify({
                  stripe_subscription_id: foundSubscription.id,
                  updated_at: new Date().toISOString()
                })
              })
              
              console.log(`[update-subscription] ✅ Synced Stripe subscription ID to database`)
              // Update currentSubscription object for use below
              currentSubscription.stripe_subscription_id = foundSubscription.id
            } else {
              console.error(`[update-subscription] No active Stripe subscription found for customer ${currentSubscription.stripe_customer_id}`)
              return new Response(
                JSON.stringify({ 
                  error: "Data integrity issue: Subscription marked as 'paid' but no active Stripe subscription found. Please contact support.",
                  subscription_type: currentSubscription.subscription_type,
                  status: currentSubscription.status,
                  stripe_customer_id: currentSubscription.stripe_customer_id
                }),
                { 
                  status: 400,
                  headers: { 
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                  } 
                }
              )
            }
          } catch (stripeError) {
            console.error(`[update-subscription] Error looking up Stripe subscription:`, stripeError)
            return new Response(
              JSON.stringify({ 
                error: "Failed to look up Stripe subscription. Please contact support.",
                details: stripeError.message
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
        } else {
          // Not a paid subscription or no customer ID
          console.error(`[update-subscription] Cannot toggle recurring billing: no Stripe subscription ID`)
          return new Response(
            JSON.stringify({ 
              error: "No active Stripe subscription found. Recurring billing can only be toggled for paid subscriptions with an active Stripe subscription.",
              subscription_type: currentSubscription.subscription_type,
              status: currentSubscription.status,
              has_customer_id: !!currentSubscription.stripe_customer_id
            }),
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

