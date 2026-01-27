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
 * Get the base merchant identifier for matching
 * Returns a simplified version that can match across variations
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
 */
export function isSameMerchant(desc1: string, desc2: string): boolean {
  return getMerchantBaseKey(desc1) === getMerchantBaseKey(desc2)
}
