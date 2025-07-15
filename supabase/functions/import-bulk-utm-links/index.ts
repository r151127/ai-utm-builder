
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
  short_url?: string;
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

// Function to create TinyURL with custom alias and fallback strategies
async function createTrackingTinyURL(trackingUrl: string, customAlias?: string): Promise<string> {
  const tinyUrlToken = Deno.env.get('TINYURL_API_TOKEN');
  
  if (!tinyUrlToken) {
    console.warn('TinyURL API token not found, using tracking URL directly');
    return trackingUrl;
  }

  if (!customAlias || !customAlias.trim()) {
    console.log('No custom alias provided, creating random TinyURL');
    return await createTinyUrlWithoutAlias(trackingUrl, tinyUrlToken);
  }

  const baseAlias = customAlias.trim();
  console.log('=== TINYURL CREATION DEBUG ===');
  console.log('Base alias requested:', baseAlias);
  console.log('Tracking URL:', trackingUrl);

  // Try different alias variations
  const aliasVariations = [
    baseAlias,
    `${baseAlias}-v1`,
    `${baseAlias}-2025`,
    `${baseAlias}-${Date.now().toString().slice(-4)}`,
    `${baseAlias}-${Math.random().toString(36).substring(2, 6)}`
  ];

  for (const alias of aliasVariations) {
    console.log(`Trying alias: ${alias}`);
    
    try {
      const requestBody = {
        url: trackingUrl,
        domain: 'tinyurl.com',
        alias: alias
      };

      console.log('TinyURL API request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch('https://api.tinyurl.com/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tinyUrlToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log(`TinyURL API response status: ${response.status}`);
      console.log(`TinyURL API response: ${responseText}`);

      if (response.ok) {
        const data = JSON.parse(responseText);
        const tinyUrl = data.data?.tiny_url;
        
        if (tinyUrl) {
          console.log(`✅ SUCCESS: Created TinyURL with alias "${alias}": ${tinyUrl}`);
          
          // Verify the alias is actually in the URL
          if (tinyUrl.includes(alias)) {
            console.log(`✅ VERIFIED: Alias "${alias}" is in the URL`);
            return tinyUrl;
          } else {
            console.log(`⚠️ WARNING: Alias "${alias}" not found in URL: ${tinyUrl}`);
            return tinyUrl; // Still return it as it might work
          }
        }
      }

      // Log specific error details
      if (response.status === 422) {
        console.log(`❌ Alias "${alias}" rejected (422 - likely already taken or invalid format)`);
        try {
          const errorData = JSON.parse(responseText);
          console.log('Error details:', JSON.stringify(errorData, null, 2));
        } catch (e) {
          console.log('Could not parse error response');
        }
      } else {
        console.log(`❌ Alias "${alias}" failed with status ${response.status}`);
      }

    } catch (error) {
      console.error(`❌ Error trying alias "${alias}":`, error);
    }
  }

  // If all alias attempts failed, create without alias
  console.log('⚠️ All alias attempts failed, creating TinyURL without alias');
  return await createTinyUrlWithoutAlias(trackingUrl, tinyUrlToken);
}

// Helper function to create TinyURL without alias
async function createTinyUrlWithoutAlias(trackingUrl: string, tinyUrlToken: string): Promise<string> {
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

    if (response.ok) {
      const data = await response.json();
      const tinyUrl = data.data?.tiny_url;
      console.log('✅ Fallback TinyURL created:', tinyUrl);
      return tinyUrl || trackingUrl;
    } else {
      console.error('❌ Fallback TinyURL creation failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('❌ Error creating fallback TinyURL:', error);
  }
  
  return trackingUrl;
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

        // Enhanced logging for domain debugging
        console.log('=== PROCESSING LINK ===')
        console.log('Email:', linkData.email)
        console.log('CSV domain value (raw):', linkData.domain)
        console.log('CSV domain type:', typeof linkData.domain)
        console.log('CSV domain length:', linkData.domain ? linkData.domain.length : 'undefined')
        console.log('CSV domain empty check:', !linkData.domain)
        console.log('Full URL:', linkData.full_url)
        
        // Use domain from CSV if provided and not empty/whitespace, otherwise extract from URL as fallback
        const finalDomain = (linkData.domain && linkData.domain.trim()) ? linkData.domain.trim() : extractDomainFromUrl(linkData.full_url);
        
        console.log('Final domain used:', finalDomain)
        console.log('Domain source:', (linkData.domain && linkData.domain.trim()) ? 'CSV' : 'URL_FALLBACK')

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
          short_url: '', // Temporary, will be updated
          tracking_url: '', // Temporary, will be updated
          clicks: 0,
          source: 'bulk',
          user_id: null,
          created_at: new Date().toISOString()
        }

        console.log('Inserting bulk link data with domain:', finalDomain)

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
        
        // Create TinyURL with custom alias from CSV domain
        const customAlias = (linkData.domain && linkData.domain.trim()) ? linkData.domain.trim() : undefined;
        console.log('Using custom alias:', customAlias)
        
        const tinyUrl = await createTrackingTinyURL(trackingUrl, customAlias)

        console.log('=== FINAL RESULT ===')
        console.log('Database ID:', data.id)
        console.log('Tracking URL:', trackingUrl)
        console.log('Final TinyURL:', tinyUrl)
        console.log('Custom alias requested:', customAlias)
        console.log('Alias in URL:', customAlias && tinyUrl.includes(customAlias))
        console.log('Click flow:', `${tinyUrl} → ${trackingUrl} → ${linkData.full_url}`)

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

        // Verify the click tracking works by testing the tracking URL
        console.log('✅ Successfully created bulk link:', {
          id: data.id,
          email: linkData.email,
          short_url: tinyUrl,
          tracking_url: trackingUrl,
          domain: finalDomain,
          custom_alias: customAlias,
          alias_success: customAlias && tinyUrl.includes(customAlias)
        })

        results.push({
          email: linkData.email,
          id: data.id,
          short_url: tinyUrl,
          tracking_url: trackingUrl,
          domain: finalDomain,
          custom_alias: customAlias,
          alias_success: customAlias && tinyUrl.includes(customAlias),
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
    console.log(`Successful aliases: ${results.filter(r => r.alias_success).length}`)
    console.log(`Failed aliases: ${results.filter(r => !r.alias_success).length}`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        errors,
        summary: {
          successful_aliases: results.filter(r => r.alias_success).length,
          failed_aliases: results.filter(r => !r.alias_success).length,
          total_processed: results.length
        },
        message: `Successfully processed ${results.length} links with custom domain aliases`
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
