
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
    const { url, customAlias, program, channel, code, codeName } = await req.json()
    console.log('Shortening URL:', url, 'with alias:', customAlias)

    // Generate meaningful domain name if not provided
    let finalAlias = customAlias
    if (!finalAlias && program && channel) {
      // Channel shortcuts for URL generation
      const channelKeys: { [key: string]: string } = {
        'Influencer Marketing': 'ifmkt',
        'Digital Marketing': 'digitalads',
        'Affiliate': 'affiliate',
        'Digital Affiliate': 'digitalaffiliate',
        'College Dosth': 'collegedosth',
        'Employee Referral': 'empref',
        'Invite & Earn': 'invite',
        'Brand Search': 'brandsearch',
        'SEO': 'seo',
        'NET': 'net'
      }

      const channelKey = channelKeys[channel] || channel.toLowerCase().replace(/\s+/g, '')
      let generatedAlias = `${program}-${channelKey}`
      
      if (code) generatedAlias += `-${code}`
      if (codeName) generatedAlias += `-${codeName}`
      
      finalAlias = generatedAlias
      console.log('Generated alias:', finalAlias)
    }

    // Try TinyURL with API token
    const tinyUrlToken = Deno.env.get('TINYURL_API_TOKEN')
    
    if (tinyUrlToken) {
      try {
        console.log('Using TinyURL API with token for alias:', finalAlias)
        
        const tinyUrlApiUrl = 'https://api.tinyurl.com/create'
        const requestBody = {
          url: url,
          ...(finalAlias && { domain: 'tinyurl.com', alias: finalAlias })
        }

        console.log('TinyURL API request body:', requestBody)

        const response = await fetch(tinyUrlApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tinyUrlToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })

        const responseText = await response.text()
        console.log('TinyURL API response status:', response.status)
        console.log('TinyURL API response:', responseText)

        if (response.ok) {
          const data = JSON.parse(responseText)
          if (data.data && data.data.tiny_url) {
            console.log('TinyURL API success:', data.data.tiny_url)
            return new Response(JSON.stringify({ shortUrl: data.data.tiny_url }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        }

        // If custom alias failed, try without alias
        if (finalAlias && response.status === 422) {
          console.log('Custom alias failed, trying without alias')
          const fallbackResponse = await fetch(tinyUrlApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tinyUrlToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ url: url })
          })

          if (fallbackResponse.ok) {
            const fallbackData = JSON.parse(await fallbackResponse.text())
            if (fallbackData.data && fallbackData.data.tiny_url) {
              console.log('TinyURL fallback success:', fallbackData.data.tiny_url)
              return new Response(JSON.stringify({ shortUrl: fallbackData.data.tiny_url }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              })
            }
          }
        }

      } catch (error) {
        console.warn('TinyURL API failed:', error)
      }
    }

    // Try legacy TinyURL method as fallback
    try {
      console.log('Trying legacy TinyURL method')
      const tinyUrlApi = 'https://tinyurl.com/api-create.php'
      const params = new URLSearchParams({
        url: url,
        ...(finalAlias && { alias: finalAlias })
      })

      console.log('Legacy TinyURL request with params:', params.toString())
      
      const response = await fetch(`${tinyUrlApi}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain'
        }
      })

      if (response.ok) {
        const shortUrl = await response.text()
        console.log('Legacy TinyURL response:', shortUrl)

        // Check if TinyURL returned an error
        if (!shortUrl.includes('Error') && !shortUrl.includes('error') && shortUrl.length > 10) {
          return new Response(JSON.stringify({ shortUrl: shortUrl.trim() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
    } catch (error) {
      console.warn('Legacy TinyURL failed:', error)
    }

    // Final fallback: generate a simple short ID and return the tracking URL as "short" URL
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
