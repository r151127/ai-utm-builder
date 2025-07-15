
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
  short_url: string; // This should be the TinyURL
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
            !linkData.platform || !linkData.placement || !linkData.full_url || 
            !linkData.short_url) {
          errors.push({
            email: linkData.email || 'unknown',
            error: 'Missing required fields'
          })
          continue
        }

        // Generate tracking URL that bulk imports will use for click tracking
        const trackingUrl = `${supabaseUrl}/functions/v1/track-click?id={{ID}}`

        // Prepare data for insertion - short_url is the TinyURL from the sheet
        const insertData = {
          email: linkData.email,
          program: linkData.program,
          channel: linkData.channel,
          platform: linkData.platform,
          placement: linkData.placement,
          code: linkData.code || null,
          domain: linkData.domain || null,
          utm_source: linkData.utm_source,
          utm_medium: linkData.utm_medium,
          utm_campaign: linkData.utm_campaign,
          full_url: linkData.full_url,
          short_url: linkData.short_url, // TinyURL from the sheet
          tracking_url: trackingUrl, // Our tracking endpoint
          clicks: 0,
          source: 'bulk',
          user_id: null, // Bulk imports don't have user accounts
          created_at: new Date().toISOString()
        }

        console.log('Inserting bulk link data:', {
          email: insertData.email,
          program: insertData.program,
          channel: insertData.channel,
          short_url: insertData.short_url,
          full_url: insertData.full_url
        })

        // Insert into database
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

        // Update tracking URL with actual ID
        const actualTrackingUrl = trackingUrl.replace('{{ID}}', data.id)
        
        await supabase
          .from('utm_links')
          .update({ tracking_url: actualTrackingUrl })
          .eq('id', data.id)

        console.log('Successfully inserted bulk link:', {
          id: data.id,
          email: linkData.email,
          short_url: linkData.short_url,
          tracking_url: actualTrackingUrl
        })

        results.push({
          email: linkData.email,
          id: data.id,
          short_url: linkData.short_url, // Return the TinyURL
          tracking_url: actualTrackingUrl,
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
        errors
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
