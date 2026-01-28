/**
 * Common merchant abbreviations and their full names
 */
const MERCHANT_ABBREVIATIONS: Record<string, string> = {
  'facebk': 'Facebook',
  'fb': 'Facebook',
  'amzn': 'Amazon',
  'amazn': 'Amazon',
  'google': 'Google',
  'googl': 'Google',
  'msft': 'Microsoft',
  'spotify': 'Spotify',
  'netflix': 'Netflix',
  'nflx': 'Netflix',
  'uber': 'Uber',
  'lyft': 'Lyft',
  'paypal': 'PayPal',
  'pp': 'PayPal',
  'dropbox': 'Dropbox',
  'slack': 'Slack',
  'zoom': 'Zoom',
  'adobe': 'Adobe',
  'canva': 'Canva',
  'shopify': 'Shopify',
  'wix': 'Wix',
  'godaddy': 'GoDaddy',
  'namecheap': 'Namecheap',
  'cloudflare': 'Cloudflare',
  'digitalocean': 'DigitalOcean',
  'heroku': 'Heroku',
  'github': 'GitHub',
  'gitlab': 'GitLab',
  'notion': 'Notion',
  'figma': 'Figma',
  'linkedin': 'LinkedIn',
  'twitter': 'Twitter',
  'x': 'X (Twitter)',
  'tiktok': 'TikTok',
  'upwork': 'Upwork',
  'fiverr': 'Fiverr',
  'stripe': 'Stripe',
  'square': 'Square',
  'intuit': 'Intuit',
  'quickbooks': 'QuickBooks',
  'xero': 'Xero',
  'mailchimp': 'Mailchimp',
  'sendgrid': 'SendGrid',
  'twilio': 'Twilio',
  'aws': 'Amazon Web Services',
  'gcp': 'Google Cloud',
  'azure': 'Microsoft Azure',
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching similar merchant names
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

/**
 * Parse merchant name from bank/credit card transaction description
 * Handles various patterns including reference codes
 */
export function parseMerchantName(description: string): string {
  let merchant = description.trim()

  // Hebrew patterns to strip from the beginning
  const prefixes = [
    /^העברה\s+ל-?\s*/,        // Transfer to
    /^תשלום\s+ל-?\s*/,        // Payment to
    /^הו"ק\s*/,               // Standing order
    /^הו''ק\s*/,              // Standing order (alternative quotes)
    /^הפקדה\s*-?\s*/,         // Deposit
    /^משיכת מזומן\s*-?\s*/,   // ATM withdrawal
    /^כרטיס אשראי\s*-?\s*/,   // Credit card
    /^ת\. זכות\s*/,           // Credit note
    /^ת\. חובה\s*/,           // Debit note
    /^העברת\s*/,              // Transfer
    /^חיוב\s*/,               // Charge
    /^זיכוי\s*/,              // Credit
  ]

  for (const prefix of prefixes) {
    merchant = merchant.replace(prefix, '')
  }

  // Remove reference codes after * (like FACEBK *94ED4BD5F2)
  merchant = merchant.replace(/\s*\*[A-Z0-9]+$/i, '')

  // Remove reference codes after - with alphanumeric (like Upwork -878873220REF)
  merchant = merchant.replace(/\s*-[A-Z0-9]{6,}$/i, '')

  // Remove reference numbers and extra details after common separators
  // Stop at digits that look like reference numbers
  merchant = merchant.split(/\s*[-–]\s*\d/)[0]

  // Stop at multiple spaces (often separates description from metadata)
  merchant = merchant.split(/\s{2,}/)[0]

  // Remove trailing reference numbers in parentheses
  merchant = merchant.replace(/\s*\([^)]*\d+[^)]*\)\s*$/, '')

  // Remove trailing asterisks and numbers (common in card transactions)
  merchant = merchant.replace(/\s*\*+\s*\d*\s*$/, '')

  merchant = merchant.trim()

  // Try to expand known abbreviations
  const lowerMerchant = merchant.toLowerCase()
  if (MERCHANT_ABBREVIATIONS[lowerMerchant]) {
    return MERCHANT_ABBREVIATIONS[lowerMerchant]
  }

  // Check if first word is a known abbreviation
  const firstWord = lowerMerchant.split(/\s+/)[0]
  if (MERCHANT_ABBREVIATIONS[firstWord]) {
    return MERCHANT_ABBREVIATIONS[firstWord]
  }

  return merchant || description.trim()
}

/**
 * Extract the first word/business name from a description
 * This is typically the actual merchant identifier
 */
export function extractFirstWord(description: string): string {
  const trimmed = description.trim()

  // Split by common separators: space, dash, asterisk, underscore
  const parts = trimmed.split(/[\s\-*_]+/)
  const firstWord = parts[0] || trimmed

  // Check if it's a known abbreviation
  const lower = firstWord.toLowerCase()
  if (MERCHANT_ABBREVIATIONS[lower]) {
    return MERCHANT_ABBREVIATIONS[lower]
  }

  return firstWord
}

/**
 * Get the base merchant identifier for matching
 * Returns a simplified version that can match across variations
 * Uses first-word extraction as the primary key for better matching
 */
export function getMerchantBaseKey(description: string): string {
  const parsed = parseMerchantName(description)

  // Normalize: lowercase, remove special chars, single spaces
  let key = parsed
    .toLowerCase()
    .replace(/['"״׳\-_.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // If it's a known expanded name, use that as the key
  const lowerParsed = parsed.toLowerCase()
  for (const [abbrev, full] of Object.entries(MERCHANT_ABBREVIATIONS)) {
    if (lowerParsed === full.toLowerCase() || lowerParsed === abbrev) {
      return full.toLowerCase()
    }
  }

  // If the parsed name still contains spaces or looks like it has a reference,
  // use only the first word as the key (this is typically the business name)
  const firstWord = extractFirstWord(parsed).toLowerCase()
  if (firstWord && firstWord.length >= 3) {
    // Check if first word is a known abbreviation
    if (MERCHANT_ABBREVIATIONS[firstWord]) {
      return MERCHANT_ABBREVIATIONS[firstWord].toLowerCase()
    }
    // Use first word as key if the full key is longer
    if (key.length > firstWord.length + 3) {
      return firstWord
    }
  }

  return key
}

/**
 * Normalize merchant name for consistent matching
 * Used for grouping transactions by merchant
 */
export function normalizeMerchantName(merchant: string): string {
  // First parse to clean up the name
  const parsed = parseMerchantName(merchant)

  return parsed
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['"״׳]/g, '')
}

/**
 * Check if two descriptions belong to the same merchant
 * Uses multiple matching strategies:
 * 1. Exact base key match
 * 2. First word match
 * 3. Fuzzy match (similarity > 85%)
 */
export function isSameMerchant(desc1: string, desc2: string): boolean {
  const key1 = getMerchantBaseKey(desc1)
  const key2 = getMerchantBaseKey(desc2)

  // Exact match on base key
  if (key1 === key2) return true

  // First word match (most common case for merchants like "Upwork -REF123")
  const firstWord1 = extractFirstWord(desc1).toLowerCase()
  const firstWord2 = extractFirstWord(desc2).toLowerCase()

  if (firstWord1 === firstWord2 && firstWord1.length >= 3) {
    return true
  }

  // Check if first words map to same abbreviation
  const expanded1 = MERCHANT_ABBREVIATIONS[firstWord1]
  const expanded2 = MERCHANT_ABBREVIATIONS[firstWord2]
  if (expanded1 && expanded2 && expanded1 === expanded2) {
    return true
  }

  // Fuzzy match on base keys (for typos, slight variations)
  // Only apply to shorter keys to avoid false positives
  if (key1.length <= 15 && key2.length <= 15) {
    const similarity = similarityRatio(key1, key2)
    if (similarity >= 0.85) return true
  }

  // Fuzzy match on first words
  if (firstWord1.length >= 4 && firstWord2.length >= 4) {
    const similarity = similarityRatio(firstWord1, firstWord2)
    if (similarity >= 0.85) return true
  }

  return false
}

/**
 * Parse description into display parts: merchant name and reference code
 * Used for highlighting the merchant name separately in the UI
 */
export function parseDescriptionParts(description: string): { merchantName: string; reference: string } {
  const trimmed = description.trim()

  // Try to find common separator patterns
  // Pattern 1: "Merchant -REFERENCE" or "Merchant - REFERENCE"
  const dashMatch = trimmed.match(/^(.+?)\s*[-–]\s*([A-Z0-9]{5,}(?:REF)?)$/i)
  if (dashMatch) {
    return { merchantName: dashMatch[1].trim(), reference: dashMatch[2] }
  }

  // Pattern 2: "Merchant *REFERENCE" (common in card transactions)
  const asteriskMatch = trimmed.match(/^(.+?)\s*\*\s*([A-Z0-9]+)$/i)
  if (asteriskMatch) {
    return { merchantName: asteriskMatch[1].trim(), reference: asteriskMatch[2] }
  }

  // Pattern 3: Just first word is merchant, rest is reference (if has numbers)
  const parts = trimmed.split(/\s+/)
  if (parts.length > 1 && /\d/.test(parts.slice(1).join(' '))) {
    return { merchantName: parts[0], reference: parts.slice(1).join(' ') }
  }

  // No clear reference pattern, return whole thing as merchant
  return { merchantName: trimmed, reference: '' }
}
