/**
 * Exchange Rates Edge Function
 * Proxies requests to Bank of Israel API to avoid CORS issues
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BOI_API_BASE = 'https://www.boi.org.il/PublicApi/GetExchangeRates'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BOIExchangeRate {
  key: string
  currentExchangeRate: number
  currentChange: number
  unit: number
  lastUpdate: string
}

interface BOIApiResponse {
  exchangeRates: BOIExchangeRate[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date')
    const latest = url.searchParams.get('latest')

    // Build BOI API URL
    const boiUrl = new URL(BOI_API_BASE)
    boiUrl.searchParams.set('rateType', 'ShkalPerUnit')
    boiUrl.searchParams.set('lang', 'en')

    if (latest === 'true') {
      boiUrl.searchParams.set('last', 'true')
    } else if (date) {
      boiUrl.searchParams.set('startDate', date)
      boiUrl.searchParams.set('endDate', date)
    } else {
      // Default to latest
      boiUrl.searchParams.set('last', 'true')
    }

    console.log('[exchange-rates] Fetching from BOI:', boiUrl.toString())

    // Fetch from BOI API
    const response = await fetch(boiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('[exchange-rates] BOI API error:', response.status, response.statusText)
      return new Response(
        JSON.stringify({ error: `BOI API error: ${response.status}` }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const data: BOIApiResponse = await response.json()

    // Transform response to simpler format
    const rates: Record<string, { rate: number; unit: number; date: string }> = {}

    for (const rate of data.exchangeRates || []) {
      rates[rate.key.toUpperCase()] = {
        rate: rate.currentExchangeRate,
        unit: rate.unit,
        date: rate.lastUpdate.split('T')[0],
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rates,
        count: Object.keys(rates).length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[exchange-rates] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch exchange rates' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
