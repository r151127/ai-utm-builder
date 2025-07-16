
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
  short_url: string; // This will be captured directly from CSV "Shorten Link" column
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
        // Validate required fields including short_url
        if (!linkData.email || !linkData.program || !linkData.channel || 
            !linkData.platform || !linkData.placement || !linkData.full_url || !linkData.short_url) {
          errors.push({
            email: linkData.email || 'unknown',
            error: 'Missing required fields (including short_url)'
          })
          continue
        }

        console.log('=== PROCESSING LINK ===')
        console.log('Email:', linkData.email)
        console.log('Short URL from CSV:', linkData.short_url)
        console.log('Full URL:', linkData.full_url)
        
        // Use domain from CSV if provided and not empty/whitespace, otherwise extract from URL as fallback
        const finalDomain = (linkData.domain && linkData.domain.trim()) ? linkData.domain.trim() : extractDomainFromUrl(linkData.full_url);
        
        console.log('Final domain used:', finalDomain)

        // First, insert the record to get an ID
        const insertData = {
          email: linkData.email,
          program: linkData.program,
          channel: linkData.channel,
          platform: linkData.platform,
          placement: linkData.placement,
          code: linkData.code || null,
          domain: finalDomain,
          utm_source: linkData.utm_source,
          utm_medium: linkData.utm_medium,
          utm_campaign: linkData.utm_campaign,
          full_url: linkData.full_url,
          short_url: linkData.short_url, // Use the short_url directly from CSV
          tracking_url: '', // Temporary, will be updated
          clicks: 0,
          source: 'bulk',
          user_id: null,
          created_at: new Date().toISOString()
        }

        console.log('Inserting bulk link data with short_url:', linkData.short_url)

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
        console.log('Created tracking URL:', trackingUrl)

        // Update the record with the tracking URL
        const { error: updateError } = await supabase
          .from('utm_links')
          .update({ 
            tracking_url: trackingUrl
          })
          .eq('id', data.id)

        if (updateError) {
          console.error('Error updating with tracking URL:', updateError)
          errors.push({
            email: linkData.email,
            error: `Failed to update tracking URL: ${updateError.message}`
          })
          continue
        }

        console.log('=== FINAL RESULT ===')
        console.log('Database ID:', data.id)
        console.log('Short URL (from CSV):', linkData.short_url)
        console.log('Tracking URL:', trackingUrl)
        console.log('Click flow:', `${linkData.short_url} → ${trackingUrl} → ${linkData.full_url}`)

        console.log('✅ Successfully created bulk link:', {
          id: data.id,
          email: linkData.email,
          short_url: linkData.short_url,
          tracking_url: trackingUrl,
          domain: finalDomain
        })

        results.push({
          email: linkData.email,
          id: data.id,
          short_url: linkData.short_url,
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

    console.log(`=== BULK IMPORT SUMMARY ===`)
    console.log(`Processed: ${results.length} successful, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        errors,
        message: `Successfully processed ${results.length} links using pre-existing short URLs from CSV`
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
