/**
 * Supabase Edge Function: get-user-email-by-id
 * 
 * This function gets a user's email address by their user ID.
 * Requires admin/service role access to list users.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. In Supabase Dashboard, go to Edge Functions
 * 2. Click "Create a new function"
 * 3. Name it: get-user-email-by-id
 * 4. Copy the code from this file into the function
 * 5. Ensure SUPABASE_SERVICE_ROLE_KEY is set in environment variables
 * 6. Deploy the function
 * 
 * USAGE:
 * POST https://your-project.supabase.co/functions/v1/get-user-email-by-id
 * Headers: { "Content-Type": "application/json", "Authorization": "Bearer <token>" }
 * Body: { "userId": "user-uuid" }
 * 
 * RESPONSE:
 * { "email": "user@example.com" } or { "error": "error message" }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId || typeof userId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseClient.auth.admin.getUserById(userId)

    if (error) {
      console.error('[get-user-email-by-id] Error getting user:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!data || !data.user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ email: data.user.email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[get-user-email-by-id] Exception:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

