
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
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    
    console.log('Track-click called with ID:', id)

    if (!id) {
      console.error('Missing ID parameter')
      return new Response('Missing required ID parameter', { 
        status: 400,
        headers: corsHeaders 
      })
    }

    // Get client IP and user agent for unique tracking
    // Extract only the first IP address from the forwarded chain for consistent tracking
    const rawClientIP = req.headers.get('x-forwarded-for') || 
                       req.headers.get('x-real-ip') || 
                       'unknown'
    const clientIP = rawClientIP.split(',')[0].trim()
    const userAgent = req.headers.get('user-agent') || 'unknown'

    console.log('Client info:', { clientIP, userAgent, rawClientIP })

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // First, get the UTM link record to get the full URL
    console.log('Fetching UTM link record for ID:', id)
    const { data: linkData, error: fetchError } = await supabase
      .from('utm_links')
      .select('full_url, clicks, unique_clicks')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('Error fetching link data:', fetchError)
      return new Response('Link not found', { 
        status: 404,
        headers: corsHeaders 
      })
    }

    if (!linkData) {
      console.error('No link data found for ID:', id)
      return new Response('Link not found', { 
        status: 404,
        headers: corsHeaders 
      })
    }

    console.log('Found link with current clicks:', linkData.clicks, 'unique clicks:', linkData.unique_clicks)
    console.log('Full URL to redirect to:', linkData.full_url)

    // Use constraint-based approach to determine unique clicks
    // Try to insert the click log - if it succeeds, it's a unique click
    // If it fails due to unique constraint, it's a repeat click
    console.log('Attempting to log click...')
    const { error: logError } = await supabase
      .from('click_logs')
      .insert({
        utm_link_id: id,
        ip_address: clientIP,
        user_agent: userAgent
      })

    let isUniqueClick = true
    if (logError) {
      // Check if the error is due to unique constraint violation (code 23505)
      if (logError.code === '23505' || logError.message?.includes('unique_utm_link_ip_user_agent')) {
        console.log('Duplicate click detected - not a unique visitor')
        isUniqueClick = false
      } else {
        console.error('Unexpected error logging click:', logError)
        // Continue with processing even if logging fails
      }
    } else {
      console.log('Successfully logged new unique click')
    }

    console.log('Is unique click:', isUniqueClick)

    // Update click counts
    console.log('Updating click counts...')
    const updateData: any = {
      clicks: (linkData.clicks || 0) + 1
    }

    // Only increment unique clicks if this is a unique click
    if (isUniqueClick) {
      updateData.unique_clicks = (linkData.unique_clicks || 0) + 1
      console.log('Incrementing unique clicks to:', updateData.unique_clicks)
    } else {
      console.log('Not incrementing unique clicks - repeat visitor')
    }

    const { error: updateError } = await supabase
      .from('utm_links')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('Database error while updating clicks:', updateError)
      // Still redirect even if database update fails
    } else {
      console.log('Successfully updated clicks. Total:', updateData.clicks, 'Unique:', updateData.unique_clicks)
    }

    // Redirect to the full URL (with UTM parameters)
    console.log('Redirecting to full URL:', linkData.full_url)
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': linkData.full_url
      }
    })

  } catch (error) {
    console.error('Error in track-click function:', error)
    
    return new Response('Internal server error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
})
