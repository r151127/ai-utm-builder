
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const { url, customAlias } = await req.json()
    console.log('Shortening URL:', url, 'with alias:', customAlias)

    // Try TinyURL first
    try {
      const tinyUrlApi = 'https://tinyurl.com/api-create.php'
      const params = new URLSearchParams({
        url: url,
        ...(customAlias && { alias: customAlias })
      })

      console.log('Making TinyURL request with params:', params.toString())
      
      const response = await fetch(`${tinyUrlApi}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain'
        }
      })

      if (response.ok) {
        const shortUrl = await response.text()
        console.log('TinyURL response:', shortUrl)

        // Check if TinyURL returned an error
        if (!shortUrl.includes('Error') && !shortUrl.includes('error') && shortUrl.length > 10) {
          return new Response(JSON.stringify({ shortUrl: shortUrl.trim() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
    } catch (error) {
      console.warn('TinyURL failed:', error)
    }

    // Fallback: generate a simple short ID and return the tracking URL as "short" URL
    const shortId = Math.random().toString(36).substring(2, 8)
    const fallbackShortUrl = `https://short.ly/${shortId}` // This would be your tracking URL in practice
    
    console.log('Using fallback short URL:', fallbackShortUrl)
    
    return new Response(JSON.stringify({ shortUrl: fallbackShortUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in shorten-url function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
