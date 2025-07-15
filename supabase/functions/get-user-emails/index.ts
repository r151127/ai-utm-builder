
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userIds } = await req.json()
    console.log('Fetching emails for user IDs:', userIds)

    if (!userIds || !Array.isArray(userIds)) {
      return new Response(JSON.stringify({ error: 'Invalid userIds provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const emailMap: { [key: string]: string } = {}

    // Get unique user IDs
    const uniqueUserIds = [...new Set(userIds)]
    
    for (const userId of uniqueUserIds) {
      try {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)
        
        if (!userError && userData?.user?.email) {
          emailMap[userId] = userData.user.email
          console.log(`Found email for user ${userId}: ${userData.user.email}`)
        } else {
          console.warn(`No email found for user ${userId}:`, userError)
          emailMap[userId] = 'Unknown'
        }
      } catch (err) {
        console.error(`Error fetching email for user ${userId}:`, err)
        emailMap[userId] = 'Unknown'
      }
    }

    console.log('Email mapping result:', emailMap)

    return new Response(JSON.stringify({ emailMap }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in get-user-emails function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
