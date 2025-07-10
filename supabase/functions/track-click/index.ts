
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
    const redirectUrl = url.searchParams.get('url')

    if (!id || !redirectUrl) {
      return new Response('Missing required parameters', { 
        status: 400,
        headers: corsHeaders 
      })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Increment click count
    const { error } = await supabase
      .from('utm_links')
      .update({ 
        clicks: supabase.sql`clicks + 1`
      })
      .eq('id', id)

    if (error) {
      console.error('Database error:', error)
      // Still redirect even if database update fails
    }

    // Redirect to the original URL
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': decodeURIComponent(redirectUrl)
      }
    })

  } catch (error) {
    console.error('Error in track-click function:', error)
    
    // Try to redirect anyway if we have the URL
    const url = new URL(req.url)
    const redirectUrl = url.searchParams.get('url')
    
    if (redirectUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': decodeURIComponent(redirectUrl)
        }
      })
    }

    return new Response('Internal server error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
})
