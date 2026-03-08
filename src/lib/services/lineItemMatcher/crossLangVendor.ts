/**
 * Cross-Language Vendor Name Matching via Gemini AI
 *
 * When vendor names are in different languages (e.g., "PayPlus Ltd" vs "פיי פלוס"),
 * standard word-based matching fails. This module uses Gemini Flash-Lite to evaluate
 * whether two business names in different languages refer to the same entity.
 *
 * Points: scales Gemini's confidence (0-100) to 0-25 vendor points.
 * Floor: below 40% confidence → 0 points.
 * Cache: results are cached per session to avoid redundant API calls.
 */

const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/** Minimum AI confidence to award any points */
const MIN_CONFIDENCE_THRESHOLD = 40

/** Maximum vendor points (must match SCORING_WEIGHTS.VENDOR) */
const MAX_VENDOR_POINTS = 25

/** Session cache: "nameA|||nameB" → points (0-25) */
const scoreCache = new Map<string, number>()

/**
 * Check if a string contains Hebrew characters
 */
function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text)
}

/**
 * Check if a string contains Latin characters
 */
function containsLatin(text: string): boolean {
  return /[a-zA-Z]/.test(text)
}

/**
 * Detect if two strings are in different language scripts (Hebrew vs Latin)
 */
export function hasLanguageMismatch(text1: string, text2: string): boolean {
  const t1Hebrew = containsHebrew(text1)
  const t1Latin = containsLatin(text1)
  const t2Hebrew = containsHebrew(text2)
  const t2Latin = containsLatin(text2)

  // One is Hebrew-only, the other is Latin-only
  return (t1Hebrew && !t1Latin && t2Latin && !t2Hebrew) ||
         (t1Latin && !t1Hebrew && t2Hebrew && !t2Latin)
}

/**
 * Build a cache key from two names (order-independent)
 */
function cacheKey(name1: string, name2: string): string {
  const a = name1.toLowerCase().trim()
  const b = name2.toLowerCase().trim()
  return a < b ? `${a}|||${b}` : `${b}|||${a}`
}

/**
 * Call Gemini to get match confidence between two vendor names in different languages
 * Returns 0-100 confidence percentage
 */
async function callGeminiForVendorMatch(name1: string, name2: string): Promise<number> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[crossLangVendor] VITE_GEMINI_API_KEY not configured')
    return 0
  }

  const prompt = `You are a business name matching assistant. Determine if these two business names (in different languages) refer to the same company or entity.

Name A: "${name1}"
Name B: "${name2}"

Reply with ONLY a number from 0 to 100 representing the probability they are the same entity. Nothing else, just the number.`

  try {
    console.log('[crossLangVendor] Calling Gemini for:', name1, 'vs', name2)
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 10,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('[crossLangVendor] Gemini API error:', response.status, errorBody)
      return 0
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    console.log('[crossLangVendor] Gemini response:', text)
    const confidence = parseInt(text, 10)

    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      console.warn('[crossLangVendor] Unexpected Gemini response:', text)
      return 0
    }

    console.log('[crossLangVendor] Confidence:', confidence, '→ Points:', confidenceToPoints(confidence))
    return confidence
  } catch (err) {
    console.warn('[crossLangVendor] Gemini call failed:', err)
    return 0
  }
}

/**
 * Convert AI confidence (0-100) to vendor points (0-25)
 * Returns 0 if confidence is below the minimum threshold (40%)
 */
export function confidenceToPoints(confidence: number): number {
  if (confidence < MIN_CONFIDENCE_THRESHOLD) return 0
  return Math.round((confidence / 100) * MAX_VENDOR_POINTS)
}

/**
 * Get cross-language vendor match points for two names.
 * Only calls Gemini if there's a language mismatch; uses cache for repeated pairs.
 *
 * @param vendorName - Vendor name from invoice (e.g., "PayPlus Ltd")
 * @param txDescription - Transaction description (e.g., "פיי פלוס")
 * @returns Points to award (0-25), or null if no language mismatch detected
 */
export async function getCrossLangVendorScore(
  vendorName: string,
  txDescription: string
): Promise<number | null> {
  if (!vendorName || !txDescription) return null

  // Only trigger for cross-language pairs
  if (!hasLanguageMismatch(vendorName, txDescription)) return null

  const key = cacheKey(vendorName, txDescription)

  // Check cache
  if (scoreCache.has(key)) {
    return scoreCache.get(key)!
  }

  // Call Gemini
  const confidence = await callGeminiForVendorMatch(vendorName, txDescription)
  const points = confidenceToPoints(confidence)

  // Cache the result
  scoreCache.set(key, points)

  return points
}

/**
 * Clear the session cache (useful for testing)
 */
export function clearCrossLangCache(): void {
  scoreCache.clear()
}
