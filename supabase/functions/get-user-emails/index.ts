
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

    // Return early if no user IDs
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ emailMap: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const emailMap: { [key: string]: string } = {}

    // Get unique user IDs and limit batch size to prevent timeouts
    const uniqueUserIds = [...new Set(userIds)].slice(0, 50) // Limit to 50 users max
    
    console.log(`Processing ${uniqueUserIds.length} unique user IDs`)

    // Process users in smaller batches for better performance
    const batchSize = 10
    for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
      const batch = uniqueUserIds.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueUserIds.length/batchSize)}:`, batch)
      
      // Process batch concurrently with timeout
      const batchPromises = batch.map(async (userId) => {
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout for user ${userId}`)), 5000)
          )
          
          const userPromise = supabase.auth.admin.getUserById(userId)
          
          const { data: userData, error: userError } = await Promise.race([userPromise, timeoutPromise]) as any
          
          if (!userError && userData?.user?.email) {
            emailMap[userId] = userData.user.email
            console.log(`✓ Found email for user ${userId}: ${userData.user.email}`)
          } else {
            console.warn(`⚠ No email found for user ${userId}:`, userError?.message || 'No data')
            emailMap[userId] = 'Unknown'
          }
        } catch (err) {
          console.error(`✗ Error fetching email for user ${userId}:`, err.message)
          emailMap[userId] = 'Unknown'
        }
      })

      // Wait for batch to complete
      await Promise.allSettled(batchPromises)
      
      // Small delay between batches to prevent overwhelming the auth service
      if (i + batchSize < uniqueUserIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log('Email mapping completed:', Object.keys(emailMap).length, 'users processed')

    return new Response(JSON.stringify({ emailMap }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in get-user-emails function:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
