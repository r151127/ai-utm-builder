
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BulkUTMData {
  email: string;
  program: string;
  channel: string;
  platform: string;
  placement: string;
  code?: string;
  domain?: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  full_url: string;
  short_url?: string; // This is optional now since we'll create it
}

// Function to extract domain from URL (fallback only)
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error('Error extracting domain from URL:', url, error);
    return '';
  }
}

// Function to create TinyURL that points to our tracking endpoint
async function createTrackingTinyURL(trackingUrl: string): Promise<string> {
  const tinyUrlToken = Deno.env.get('TINYURL_API_TOKEN');
  
  if (!tinyUrlToken) {
    console.warn('TinyURL API token not found, using tracking URL directly');
    return trackingUrl;
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

    const { links } = await req.json() as { links: BulkUTMData[] }

    if (!links || !Array.isArray(links)) {
      return new Response(
        JSON.stringify({ error: 'Invalid data format. Expected { links: Array }' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = []
    const errors = []

    for (const linkData of links) {
      try {
        // Validate required fields
        if (!linkData.email || !linkData.program || !linkData.channel || 
            !linkData.platform || !linkData.placement || !linkData.full_url) {
          errors.push({
            email: linkData.email || 'unknown',
            error: 'Missing required fields'
          })
          continue
        }

        // Use domain from CSV if provided, otherwise extract from URL as fallback
        const finalDomain = linkData.domain || extractDomainFromUrl(linkData.full_url);

        // First, insert the record to get an ID
        const insertData = {
          email: linkData.email,
          program: linkData.program,
          channel: linkData.channel,
          platform: linkData.platform,
          placement: linkData.placement,
          code: linkData.code || null,
          domain: finalDomain, // Use CSV domain or URL fallback
          utm_source: linkData.utm_source,
          utm_medium: linkData.utm_medium,
          utm_campaign: linkData.utm_campaign,
          full_url: linkData.full_url,
          short_url: '', // Temporary, will be updated
          tracking_url: '', // Temporary, will be updated
          clicks: 0,
          source: 'bulk',
          user_id: null,
          created_at: new Date().toISOString()
        }

        console.log('Inserting bulk link data:', {
          email: insertData.email,
          program: insertData.program,
          channel: insertData.channel,
          full_url: insertData.full_url,
          csv_domain: linkData.domain,
          final_domain: finalDomain
        })

        // Insert into database to get the ID
        const { data, error } = await supabase
          .from('utm_links')
          .insert(insertData)
          .select('id')
          .single()

        if (error) {
          console.error('Database insert error:', error)
          errors.push({
            email: linkData.email,
            error: error.message
          })
          continue
        }

        // Create tracking URL with the actual ID
        const trackingUrl = `${supabaseUrl}/functions/v1/track-click?id=${data.id}`
        
        // Create TinyURL that points to our tracking endpoint
        const tinyUrl = await createTrackingTinyURL(trackingUrl)

        console.log('Created tracking setup:', {
          id: data.id,
          trackingUrl,
          tinyUrl,
          csv_domain: linkData.domain,
          final_domain: finalDomain,
          finalDestination: linkData.full_url
        })

        // Update the record with the actual tracking URL and TinyURL
        const { error: updateError } = await supabase
          .from('utm_links')
          .update({ 
            tracking_url: trackingUrl,
            short_url: tinyUrl
          })
          .eq('id', data.id)

        if (updateError) {
          console.error('Error updating with URLs:', updateError)
          errors.push({
            email: linkData.email,
            error: `Failed to update URLs: ${updateError.message}`
          })
          continue
        }

        console.log('Successfully created bulk link with tracking:', {
          id: data.id,
          email: linkData.email,
          short_url: tinyUrl,
          tracking_url: trackingUrl,
          domain: finalDomain,
          clicks_through: `${tinyUrl} → ${trackingUrl} → ${linkData.full_url}`
        })

        results.push({
          email: linkData.email,
          id: data.id,
          short_url: tinyUrl,
          tracking_url: trackingUrl,
          domain: finalDomain,
          status: 'success'
        })

      } catch (err) {
        console.error('Processing error for link:', err)
        errors.push({
          email: linkData.email || 'unknown',
          error: err.message
        })
      }
    }

    console.log(`Bulk import completed: ${results.length} successful, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        errors,
        message: `Successfully processed ${results.length} links with click tracking enabled and proper domain handling`
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
