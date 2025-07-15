
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Function to create TinyURL that points to our tracking endpoint
async function createTrackingTinyURL(trackingUrl: string): Promise<string> {
  const tinyUrlToken = Deno.env.get('TINYURL_API_TOKEN');
  
  if (!tinyUrlToken) {
    console.warn('TinyURL API token not found, cannot create tracking URLs');
    return trackingUrl; // Return tracking URL directly if no token
  }

  try {
    const response = await fetch('https://api.tinyurl.com/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tinyUrlToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: trackingUrl,
        domain: 'tinyurl.com'
      })
    });

    if (!response.ok) {
      console.error('TinyURL API error:', response.status, await response.text());
      return trackingUrl;
    }

    const data = await response.json();
    return data.data?.tiny_url || trackingUrl;
  } catch (error) {
    console.error('Error creating TinyURL:', error);
    return trackingUrl;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Starting bulk links fix process...')

    // Check if TinyURL API token is configured
    const tinyUrlToken = Deno.env.get('TINYURL_API_TOKEN');
    if (!tinyUrlToken) {
      return new Response(
        JSON.stringify({ 
          error: 'TinyURL API token not configured',
          message: 'Please configure TINYURL_API_TOKEN in Edge Functions secrets'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all bulk links that need fixing
    const { data: bulkLinks, error: fetchError } = await supabase
      .from('utm_links')
      .select('id, short_url, tracking_url, full_url, email')
      .eq('source', 'bulk')

    if (fetchError) {
      console.error('Error fetching bulk links:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bulk links', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!bulkLinks || bulkLinks.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No bulk links found to fix',
          processed: 0,
          errors: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${bulkLinks.length} bulk links to process`)

    const results = []
    const errors = []

    for (const link of bulkLinks) {
      try {
        console.log(`Processing link ${link.id} for ${link.email}`)

        // Check if the short_url is already pointing to our tracking system
        if (link.short_url && link.short_url.includes('track-click')) {
          console.log(`Link ${link.id} already has tracking URL, skipping`)
          results.push({
            id: link.id,
            email: link.email,
            status: 'already_tracking',
            short_url: link.short_url
          })
          continue
        }

        // Create new TinyURL that points to the tracking URL
        const newTinyUrl = await createTrackingTinyURL(link.tracking_url)
        
        console.log(`Created new tracking TinyURL for ${link.id}: ${newTinyUrl}`)

        // Update the record with the new TinyURL
        const { error: updateError } = await supabase
          .from('utm_links')
          .update({ short_url: newTinyUrl })
          .eq('id', link.id)

        if (updateError) {
          console.error(`Error updating link ${link.id}:`, updateError)
          errors.push({
            id: link.id,
            email: link.email,
            error: updateError.message
          })
          continue
        }

        console.log(`Successfully updated link ${link.id} with new tracking URL`)

        results.push({
          id: link.id,
          email: link.email,
          status: 'fixed',
          old_short_url: link.short_url,
          new_short_url: newTinyUrl,
          tracking_flow: `${newTinyUrl} → ${link.tracking_url} → ${link.full_url}`
        })

      } catch (err) {
        console.error(`Error processing link ${link.id}:`, err)
        errors.push({
          id: link.id,
          email: link.email || 'unknown',
          error: err.message
        })
      }
    }

    console.log(`Bulk links fix completed: ${results.length} successful, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Fixed ${results.length} bulk links for click tracking`,
        processed: results.length,
        errors: errors.length,
        results,
        errors,
        summary: {
          total_links: bulkLinks.length,
          fixed: results.filter(r => r.status === 'fixed').length,
          already_tracking: results.filter(r => r.status === 'already_tracking').length,
          failed: errors.length
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (err) {
    console.error('Function error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: err.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
