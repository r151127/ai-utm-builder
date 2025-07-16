
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
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    console.log('Client info:', { clientIP, userAgent })

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

    // Check if this is a unique click (same IP + user agent combination hasn't clicked before)
    console.log('Checking for existing click log...')
    const { data: existingClick, error: clickCheckError } = await supabase
      .from('click_logs')
      .select('id')
      .eq('utm_link_id', id)
      .eq('ip_address', clientIP)
      .eq('user_agent', userAgent)
      .maybeSingle()

    if (clickCheckError) {
      console.error('Error checking existing clicks:', clickCheckError)
    }

    const isUniqueClick = !existingClick
    console.log('Is unique click:', isUniqueClick)

    // Log this click
    console.log('Logging click...')
    const { error: logError } = await supabase
      .from('click_logs')
      .insert({
        utm_link_id: id,
        ip_address: clientIP,
        user_agent: userAgent
      })

    if (logError) {
      console.error('Error logging click:', logError)
    }

    // Update click counts
    console.log('Updating click counts...')
    const updateData: any = {
      clicks: (linkData.clicks || 0) + 1
    }

    // Only increment unique clicks if this is a unique click
    if (isUniqueClick) {
      updateData.unique_clicks = (linkData.unique_clicks || 0) + 1
      console.log('Incrementing unique clicks to:', updateData.unique_clicks)
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
