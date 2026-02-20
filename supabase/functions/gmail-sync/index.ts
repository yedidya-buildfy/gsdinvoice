// Supabase Edge Function for Gmail receipt/invoice sync
// Handles historical email scanning (mode: 'start') and continued pagination (mode: 'continue')
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// CORS & CONSTANTS
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GEMINI_CLASSIFY_MODEL = "gemini-2.0-flash-lite";
const GEMINI_CLASSIFY_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CLASSIFY_MODEL}:generateContent`;

// Processing limits per invocation
const MAX_EMAILS_PER_PAGE = 50;
const TIMEOUT_GUARD_MS = 45_000; // 45 seconds - leave buffer for Edge Function limit
const STALE_SYNC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// TYPES
// ============================================================================
interface SyncState {
  status: "syncing" | "completed" | "failed";
  total_emails_estimated: number;
  current_page_token: string | null;
  receipts_found: number;
  emails_checked: number;
  started_at: string;
  last_error?: string;
  search_query?: string;
}

interface SenderRule {
  pattern: string; // email or domain pattern
  action: "always_trust" | "always_ignore";
}

interface EmailConnection {
  id: string;
  team_id: string;
  user_id: string;
  provider: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  scopes: string[];
  last_history_id: string | null;
  last_sync_at: string | null;
  status: string;
  sync_state: SyncState | null;
  sender_rules: SenderRule[] | null;
}

interface GmailMessageRef {
  id: string;
  threadId: string;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    attachmentId?: string;
    size: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload: GmailMessagePart;
  sizeEstimate?: number;
  internalDate?: string;
}

interface GmailSearchResult {
  messages: GmailMessageRef[] | null;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface ClassificationResult {
  is_receipt: boolean;
  confidence: number;
  vendor?: string;
  amount?: number;
  date?: string;
}

interface DownloadedContent {
  blob: Uint8Array;
  filename: string;
  mimeType: string;
}

// ============================================================================
// 4a: TOKEN MANAGEMENT
// ============================================================================

/**
 * Decrypt an AES-GCM encrypted token.
 * The encrypted value is base64-encoded: first 12 bytes = IV, remainder = ciphertext.
 * TOKEN_ENCRYPTION_KEY env var is a hex-encoded 256-bit key.
 */
async function decryptToken(encrypted: string): Promise<string> {
  const encKeyHex = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!encKeyHex) {
    throw new Error("TOKEN_ENCRYPTION_KEY not configured");
  }

  // Convert hex key to bytes
  const keyBytes = new Uint8Array(
    encKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Decode base64 to get iv + ciphertext
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt a token with AES-GCM for storage.
 * Returns base64-encoded string: 12-byte IV + ciphertext.
 */
async function encryptToken(plaintext: string): Promise<string> {
  const encKeyHex = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!encKeyHex) {
    throw new Error("TOKEN_ENCRYPTION_KEY not configured");
  }

  const keyBytes = new Uint8Array(
    encKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  // Combine iv + ciphertext into one buffer
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Encode to base64
  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * Refresh an expired Google access token using the refresh token.
 * Updates the email_connections record with the new encrypted access token.
 */
async function refreshAccessToken(
  connection: EmailConnection,
  supabase: SupabaseClient
): Promise<{ access_token: string; expires_at: string }> {
  console.log("[TOKEN] Refreshing access token for:", connection.email_address);

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured");
  }

  // Decrypt the refresh token
  const refreshToken = await decryptToken(connection.refresh_token);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[TOKEN] Refresh failed:", response.status, errorText);

    // If refresh token is revoked/invalid, mark connection as disconnected
    if (response.status === 400 || response.status === 401) {
      await supabase
        .from("email_connections")
        .update({
          status: "error",
          sync_state: {
            ...(connection.sync_state || {}),
            status: "failed",
            last_error: "Token refresh failed - reauthorization required",
          },
        })
        .eq("id", connection.id);
    }
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }

  const tokens = await response.json();
  const newAccessToken = tokens.access_token;
  const expiresInSeconds = tokens.expires_in || 3600;
  const expiresAt = new Date(
    Date.now() + expiresInSeconds * 1000
  ).toISOString();

  // Encrypt the new access token
  const encryptedAccessToken = await encryptToken(newAccessToken);

  // Update the connection record
  const { error: updateError } = await supabase
    .from("email_connections")
    .update({
      access_token: encryptedAccessToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (updateError) {
    console.error("[TOKEN] Failed to update connection:", updateError);
    // Don't throw - we still have the valid token for this invocation
  }

  console.log("[TOKEN] Access token refreshed, expires at:", expiresAt);
  return { access_token: newAccessToken, expires_at: expiresAt };
}

/**
 * Get a valid access token for a connection, refreshing if expired.
 */
async function getValidAccessToken(
  connection: EmailConnection,
  supabase: SupabaseClient
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();
  // Refresh if expiring within 5 minutes
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    // Token is still valid - decrypt and return
    return await decryptToken(connection.access_token);
  }

  // Token expired or expiring soon - refresh
  console.log("[TOKEN] Token expired or expiring soon, refreshing...");
  const refreshed = await refreshAccessToken(connection, supabase);
  return refreshed.access_token;
}

// ============================================================================
// 4b: GMAIL API HELPERS
// ============================================================================

/**
 * Search Gmail messages with a query string.
 */
async function searchMessages(
  accessToken: string,
  query: string,
  pageToken?: string
): Promise<GmailSearchResult> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(MAX_EMAILS_PER_PAGE),
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `${GMAIL_API_BASE}/messages?${params.toString()}`;
  console.log("[GMAIL] Searching messages, query:", query.substring(0, 100));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      console.warn("[GMAIL] Rate limited on search, status:", response.status);
      throw new GmailRateLimitError(
        `Gmail rate limit on search: ${response.status}`,
        response.headers.get("Retry-After")
      );
    }
    throw new Error(
      `Gmail search failed: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();
  return {
    messages: data.messages || null,
    nextPageToken: data.nextPageToken,
    resultSizeEstimate: data.resultSizeEstimate,
  };
}

/**
 * Get a single Gmail message by ID.
 */
async function getMessage(
  accessToken: string,
  messageId: string,
  format: "full" | "metadata" | "minimal" = "full"
): Promise<GmailMessage> {
  const url = `${GMAIL_API_BASE}/messages/${messageId}?format=${format}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new GmailRateLimitError(
        `Gmail rate limit on getMessage: ${response.status}`,
        response.headers.get("Retry-After")
      );
    }
    const errorText = await response.text();
    throw new Error(
      `Gmail getMessage failed: ${response.status} - ${errorText}`
    );
  }

  return await response.json();
}

/**
 * Get a Gmail message attachment by ID.
 */
async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string }> {
  const url = `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new GmailRateLimitError(
        `Gmail rate limit on getAttachment: ${response.status}`,
        response.headers.get("Retry-After")
      );
    }
    const errorText = await response.text();
    throw new Error(
      `Gmail getAttachment failed: ${response.status} - ${errorText}`
    );
  }

  return await response.json();
}

class GmailRateLimitError extends Error {
  retryAfter: string | null;
  constructor(message: string, retryAfter: string | null) {
    super(message);
    this.name = "GmailRateLimitError";
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// GMAIL MESSAGE HELPERS
// ============================================================================

/**
 * Extract a header value from a Gmail message payload.
 */
function getHeader(
  message: GmailMessage,
  headerName: string
): string | undefined {
  const headers = message.payload?.headers;
  if (!headers) return undefined;
  const header = headers.find(
    (h) => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header?.value;
}

/**
 * Extract the sender email address from From header.
 */
function getSenderEmail(message: GmailMessage): string {
  const from = getHeader(message, "From") || "";
  // Extract email from "Name <email@example.com>" format
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).toLowerCase().trim();
}

/**
 * Extract the sender domain from the From header.
 */
function getSenderDomain(message: GmailMessage): string {
  const email = getSenderEmail(message);
  const atIndex = email.indexOf("@");
  return atIndex >= 0 ? email.substring(atIndex + 1) : email;
}

/**
 * Extract plain text body from message parts recursively.
 */
function extractTextBody(part: GmailMessagePart): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }
  if (part.parts) {
    for (const subpart of part.parts) {
      const text = extractTextBody(subpart);
      if (text) return text;
    }
  }
  return "";
}

/**
 * Extract HTML body from message parts recursively.
 */
function extractHtmlBody(part: GmailMessagePart): string {
  if (part.mimeType === "text/html" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }
  if (part.parts) {
    for (const subpart of part.parts) {
      const html = extractHtmlBody(subpart);
      if (html) return html;
    }
  }
  return "";
}

/**
 * Decode Gmail's base64url-encoded data.
 */
function base64UrlDecode(data: string): string {
  // Convert base64url to standard base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  // Pad if necessary
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/**
 * Decode Gmail's base64url-encoded data to Uint8Array.
 */
function base64UrlDecodeToBytes(data: string): Uint8Array {
  const decoded = base64UrlDecode(data);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

/**
 * Find attachments in a message (PDF and image files).
 */
function findAttachments(
  part: GmailMessagePart
): Array<{
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}> {
  const attachments: Array<{
    filename: string;
    mimeType: string;
    attachmentId: string;
    size: number;
  }> = [];

  const validMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (
    part.filename &&
    part.body?.attachmentId &&
    validMimeTypes.includes(part.mimeType.toLowerCase())
  ) {
    attachments.push({
      filename: part.filename,
      mimeType: part.mimeType,
      attachmentId: part.body.attachmentId,
      size: part.body.size,
    });
  }

  if (part.parts) {
    for (const subpart of part.parts) {
      attachments.push(...findAttachments(subpart));
    }
  }

  return attachments;
}

// ============================================================================
// 4c: RULE-BASED SCORING ENGINE
// ============================================================================

// Known receipt sender domains
const KNOWN_RECEIPT_DOMAINS = new Set([
  "paypal.com",
  "paypal.co.il",
  "stripe.com",
  "amazon.com",
  "amazon.co.uk",
  "google.com",
  "apple.com",
  "microsoft.com",
  "dropbox.com",
  "spotify.com",
  "netflix.com",
  "uber.com",
  "wix.com",
  "fiverr.com",
  "heroku.com",
  "digitalocean.com",
  "cloudflare.com",
  "github.com",
  "gitlab.com",
  "atlassian.com",
  "zoom.us",
  "slack.com",
  "notion.so",
  "vercel.com",
  "render.com",
  "aws.amazon.com",
  "gandi.net",
  "namecheap.com",
  "godaddy.com",
  "hover.com",
  "squarespace.com",
  "shopify.com",
  "ebay.com",
  "aliexpress.com",
  "booking.com",
  "airbnb.com",
]);

// Financial keywords for subject and body matching
const FINANCIAL_SUBJECT_PATTERNS =
  /\b(receipt|invoice|order|payment|confirmation|billing|charge|transaction|refund|subscription)\b/i;
const FINANCIAL_SUBJECT_PATTERNS_HE = /(\u05d7\u05e9\u05d1\u05d5\u05e0\u05d9\u05ea|\u05e7\u05d1\u05dc\u05d4|\u05d0\u05d9\u05e9\u05d5\u05e8\u0520\u05ea\u05e9\u05dc\u05d5\u05dd|\u05d7\u05d9\u05d5\u05d1|\u05ea\u05e9\u05dc\u05d5\u05dd)/;
const FINANCIAL_BODY_PATTERNS =
  /\b(order\s*(?:#|number|no\.?)\s*\w+|invoice\s*(?:#|number|no\.?)\s*\w+|total[:\s]+[$\u20aa\u20ac\u00a3]?\s*[\d,.]+|amount[:\s]+[$\u20aa\u20ac\u00a3]?\s*[\d,.]+|tax[:\s]+[$\u20aa\u20ac\u00a3]?\s*[\d,.]+|vat[:\s]+[$\u20aa\u20ac\u00a3]?\s*[\d,.]+|subtotal[:\s]+[$\u20aa\u20ac\u00a3]?\s*[\d,.]+)\b/i;

// Negative signal patterns
const NEWSLETTER_SUBJECT_PATTERNS =
  /\b(unsubscribe|newsletter|sale|deal|% off|\boff\b|clearance|limited time|flash sale|promo)\b/i;
const MARKETING_CTA_PATTERNS =
  /\b(shop now|buy now|limited time|act now|exclusive offer|don't miss|last chance|hurry)\b/i;

// Billing-related sender prefixes
const BILLING_PREFIXES = new Set([
  "billing",
  "receipts",
  "receipt",
  "invoice",
  "invoices",
  "noreply",
  "no-reply",
  "payments",
  "payment",
  "orders",
  "order",
  "accounts",
  "accounting",
]);

/**
 * Score an email for receipt/invoice likelihood (0-100).
 * Higher scores indicate higher probability of being a receipt.
 */
function scoreEmail(message: GmailMessage, senderRules: SenderRule[]): number {
  let score = 0;
  const senderEmail = getSenderEmail(message);
  const senderDomain = getSenderDomain(message);
  const subject = getHeader(message, "Subject") || "";
  const body = extractTextBody(message.payload);
  const hasListUnsubscribe = !!getHeader(message, "List-Unsubscribe");
  const attachments = findAttachments(message.payload);

  // --- Check sender rules first (highest priority) ---
  for (const rule of senderRules) {
    const pattern = rule.pattern.toLowerCase();
    if (
      senderEmail === pattern ||
      senderEmail.endsWith(`@${pattern}`) ||
      senderDomain === pattern
    ) {
      if (rule.action === "always_trust") {
        return 95; // Auto-accept
      }
      if (rule.action === "always_ignore") {
        return 5; // Auto-reject
      }
    }
  }

  // --- Positive signals ---

  // Sender prefix check (billing@, receipts@, etc.)
  const senderPrefix = senderEmail.split("@")[0];
  if (BILLING_PREFIXES.has(senderPrefix)) {
    score += 15;
  }

  // PDF or image attachment
  const hasPdfAttachment = attachments.some(
    (a) => a.mimeType === "application/pdf"
  );
  const hasImageAttachment = attachments.some((a) =>
    a.mimeType.startsWith("image/")
  );
  if (hasPdfAttachment || hasImageAttachment) {
    score += 20;
  }

  // Subject contains financial keywords
  if (FINANCIAL_SUBJECT_PATTERNS.test(subject)) {
    score += 15;
  }
  if (FINANCIAL_SUBJECT_PATTERNS_HE.test(subject)) {
    score += 15;
  }

  // Body contains financial data patterns
  if (FINANCIAL_BODY_PATTERNS.test(body)) {
    score += 15;
  }

  // Known receipt sender domain
  if (KNOWN_RECEIPT_DOMAINS.has(senderDomain)) {
    score += 15;
  }

  // --- Negative signals ---

  // List-Unsubscribe header + no financial keywords = likely newsletter
  const hasFinancialKeywordsInSubject =
    FINANCIAL_SUBJECT_PATTERNS.test(subject) ||
    FINANCIAL_SUBJECT_PATTERNS_HE.test(subject);
  if (hasListUnsubscribe && !hasFinancialKeywordsInSubject) {
    score -= 30;
  }

  // Newsletter/sale subject patterns
  if (NEWSLETTER_SUBJECT_PATTERNS.test(subject)) {
    score -= 20;
  }

  // Marketing CTAs in body
  if (MARKETING_CTA_PATTERNS.test(body)) {
    score -= 15;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// 4d: AI DOUBLE-READ CLASSIFICATION
// ============================================================================

const CLASSIFICATION_PROMPT = `Analyze this email and determine if it is a receipt, invoice, or payment confirmation.

Respond with JSON only:
{
  "is_receipt": true/false,
  "confidence": 0.0-1.0,
  "vendor": "company name or null",
  "amount": 123.45 or null,
  "date": "YYYY-MM-DD or null"
}

Email subject: {subject}
Email from: {from}
Email body (first 2000 chars):
{body}`;

/**
 * Classify an email using Gemini AI (single call).
 */
async function classifyWithGemini(
  apiKey: string,
  subject: string,
  from: string,
  bodyText: string
): Promise<ClassificationResult> {
  const prompt = CLASSIFICATION_PROMPT.replace("{subject}", subject)
    .replace("{from}", from)
    .replace("{body}", bodyText.substring(0, 2000));

  const response = await fetch(`${GEMINI_CLASSIFY_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini classification failed: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error("Gemini classification returned no content");
  }

  const text = candidate.content.parts[0].text;
  // Extract JSON from the text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini classification returned no JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    is_receipt: !!parsed.is_receipt,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    vendor: parsed.vendor || undefined,
    amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
    date: parsed.date || undefined,
  };
}

/**
 * Perform AI double-read classification for ambiguous emails (score 6-94).
 * Makes two parallel Gemini calls and cross-references the results.
 * Returns a final confidence score (0-1).
 */
async function aiDoubleReadClassification(
  message: GmailMessage
): Promise<{ isReceipt: boolean; confidence: number }> {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    console.warn(
      "[AI-CLASSIFY] GEMINI_API_KEY not set, falling back to rule score"
    );
    return { isReceipt: false, confidence: 0 };
  }

  const subject = getHeader(message, "Subject") || "";
  const from = getHeader(message, "From") || "";
  const bodyText = extractTextBody(message.payload);

  try {
    // Two parallel classification calls
    const [result1, result2] = await Promise.allSettled([
      classifyWithGemini(geminiApiKey, subject, from, bodyText),
      classifyWithGemini(geminiApiKey, subject, from, bodyText),
    ]);

    const c1 =
      result1.status === "fulfilled" ? result1.value : null;
    const c2 =
      result2.status === "fulfilled" ? result2.value : null;

    if (result1.status === "rejected") {
      console.error("[AI-CLASSIFY] Call 1 failed:", result1.reason);
    }
    if (result2.status === "rejected") {
      console.error("[AI-CLASSIFY] Call 2 failed:", result2.reason);
    }

    // If both failed, cannot classify
    if (!c1 && !c2) {
      console.error("[AI-CLASSIFY] Both classification calls failed");
      return { isReceipt: false, confidence: 0 };
    }

    // If only one succeeded, use it with reduced confidence
    if (!c1 || !c2) {
      const single = c1 || c2!;
      return {
        isReceipt: single.is_receipt,
        confidence: single.confidence * 0.6,
      };
    }

    // Both succeeded - cross-reference scoring
    let crossScore = 0;

    // Type agreement: both say receipt or both say not receipt
    if (c1.is_receipt === c2.is_receipt) {
      crossScore += 30;
    }

    // Vendor name match (normalized)
    if (c1.vendor && c2.vendor) {
      const v1 = c1.vendor.toLowerCase().trim();
      const v2 = c2.vendor.toLowerCase().trim();
      if (v1 === v2 || v1.includes(v2) || v2.includes(v1)) {
        crossScore += 15;
      }
    }

    // Amount match
    if (
      c1.amount != null &&
      c2.amount != null &&
      Math.abs(c1.amount - c2.amount) < 0.01
    ) {
      crossScore += 25;
    }

    // Date match
    if (c1.date && c2.date && c1.date === c2.date) {
      crossScore += 15;
    }

    // Has attachment or link (bonus if both agree on receipt)
    const attachments = findAttachments(message.payload);
    if (attachments.length > 0 && c1.is_receipt && c2.is_receipt) {
      crossScore += 15;
    }

    const finalConfidence = crossScore / 100;
    // Use majority vote for is_receipt determination
    const isReceipt = c1.is_receipt && c2.is_receipt;

    console.log("[AI-CLASSIFY] Cross-reference score:", crossScore);
    console.log("[AI-CLASSIFY] Final confidence:", finalConfidence);
    console.log("[AI-CLASSIFY] Is receipt:", isReceipt);

    return { isReceipt, confidence: finalConfidence };
  } catch (err) {
    console.error("[AI-CLASSIFY] Unexpected error:", err);
    return { isReceipt: false, confidence: 0 };
  }
}

// ============================================================================
// 4e: CONTENT DOWNLOAD
// ============================================================================

/**
 * Download receipt content from a Gmail message.
 * Priority: PDF attachment > Image attachment > HTML body.
 */
async function downloadReceiptContent(
  accessToken: string,
  message: GmailMessage
): Promise<DownloadedContent | null> {
  const attachments = findAttachments(message.payload);

  // Priority 1: PDF attachment
  const pdfAttachment = attachments.find(
    (a) => a.mimeType === "application/pdf"
  );
  if (pdfAttachment) {
    console.log("[DOWNLOAD] Found PDF attachment:", pdfAttachment.filename);
    try {
      const attachData = await getAttachment(
        accessToken,
        message.id,
        pdfAttachment.attachmentId
      );
      const bytes = base64UrlDecodeToBytes(attachData.data);
      return {
        blob: bytes,
        filename: pdfAttachment.filename || `receipt_${message.id}.pdf`,
        mimeType: "application/pdf",
      };
    } catch (err) {
      console.error("[DOWNLOAD] PDF attachment download failed:", err);
    }
  }

  // Priority 2: Image attachment (jpg, png, webp)
  const imageAttachment = attachments.find((a) =>
    a.mimeType.startsWith("image/")
  );
  if (imageAttachment) {
    console.log("[DOWNLOAD] Found image attachment:", imageAttachment.filename);
    try {
      const attachData = await getAttachment(
        accessToken,
        message.id,
        imageAttachment.attachmentId
      );
      const bytes = base64UrlDecodeToBytes(attachData.data);
      const ext = imageAttachment.mimeType.split("/")[1] || "jpg";
      return {
        blob: bytes,
        filename:
          imageAttachment.filename || `receipt_${message.id}.${ext}`,
        mimeType: imageAttachment.mimeType,
      };
    } catch (err) {
      console.error("[DOWNLOAD] Image attachment download failed:", err);
    }
  }

  // Priority 3: HTML body (store as HTML for later processing)
  const htmlBody = extractHtmlBody(message.payload);
  if (htmlBody) {
    console.log("[DOWNLOAD] Using HTML body, length:", htmlBody.length);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(htmlBody);
    return {
      blob: bytes,
      filename: `receipt_${message.id}.html`,
      mimeType: "text/html",
    };
  }

  console.warn("[DOWNLOAD] No downloadable content found for message:", message.id);
  return null;
}

// ============================================================================
// 4f: FILE CREATION
// ============================================================================

/**
 * Compute SHA-256 hash of file bytes for deduplication.
 */
async function computeFileHash(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a file record from a downloaded email receipt.
 * Uploads to Supabase Storage and creates a files record.
 * Triggers extract-invoice for AI extraction.
 */
async function createFileFromEmail(
  supabase: SupabaseClient,
  teamId: string,
  userId: string,
  messageId: string,
  content: DownloadedContent
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  // Check for duplicate: if email_message_id already exists for this team
  const { data: existingFile } = await supabase
    .from("files")
    .select("id")
    .eq("email_message_id", messageId)
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle();

  if (existingFile) {
    console.log(
      "[FILE] Duplicate detected, skipping email_message_id:",
      messageId
    );
    return null;
  }

  // Check for duplicate file hash (catches same file uploaded manually and via email)
  const fileHash = await computeFileHash(content.blob);
  const { data: existingHash } = await supabase
    .from("files")
    .select("id")
    .eq("team_id", teamId)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();

  if (existingHash) {
    console.log(
      "[FILE] Duplicate file hash detected, skipping:",
      fileHash.substring(0, 16)
    );
    return null;
  }

  // Determine file type from MIME
  let fileType: string;
  switch (content.mimeType) {
    case "application/pdf":
      fileType = "pdf";
      break;
    case "image/jpeg":
    case "image/jpg":
      fileType = "jpg";
      break;
    case "image/png":
      fileType = "png";
      break;
    case "image/webp":
      fileType = "webp";
      break;
    case "text/html":
      fileType = "html";
      break;
    default:
      fileType = "pdf";
  }

  // Upload to Supabase Storage
  const storagePath = `receipts/${teamId}/${messageId}/${content.filename}`;
  console.log("[FILE] Uploading to storage:", storagePath);

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, content.blob, {
      contentType: content.mimeType,
      upsert: false,
    });

  if (uploadError) {
    // If file already exists in storage, it might be a partial previous attempt
    if (uploadError.message?.includes("already exists") || uploadError.message?.includes("Duplicate")) {
      console.log("[FILE] Storage file already exists, continuing with record creation");
    } else {
      console.error("[FILE] Storage upload failed:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
  }

  // Create files record
  const { data: fileRecord, error: insertError } = await supabase
    .from("files")
    .insert({
      user_id: userId,
      team_id: teamId,
      original_name: content.filename,
      storage_path: storagePath,
      file_type: fileType,
      file_size: content.blob.length,
      source: "email",
      source_type: "invoice",
      email_message_id: messageId,
      file_hash: fileHash,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[FILE] Insert failed:", insertError);
    throw new Error(`File record creation failed: ${insertError.message}`);
  }

  console.log("[FILE] Created file record:", fileRecord.id);

  // Trigger extract-invoice edge function (fire and forget)
  // Only trigger for file types that can be extracted (not HTML)
  if (fileType !== "html" && supabaseUrl && supabaseAnonKey) {
    try {
      const extractUrl = `${supabaseUrl}/functions/v1/extract-invoice`;
      console.log("[FILE] Triggering extract-invoice for file:", fileRecord.id);

      // Use service role key for the authorization since this is a server-to-server call
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      fetch(extractUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          file_id: fileRecord.id,
          storage_path: storagePath,
          file_type: fileType,
        }),
      }).catch((err) => {
        // Non-blocking: log but don't fail the sync
        console.error("[FILE] extract-invoice trigger failed:", err);
      });
    } catch (err) {
      console.error("[FILE] Failed to trigger extract-invoice:", err);
    }
  }

  return fileRecord.id;
}

// ============================================================================
// 4g: PAGINATION + SYNC STATE MANAGEMENT
// ============================================================================

/**
 * Update sync state on the email_connections record.
 */
async function updateSyncState(
  supabase: SupabaseClient,
  connectionId: string,
  syncState: Partial<SyncState>
): Promise<void> {
  const { error } = await supabase
    .from("email_connections")
    .update({
      sync_state: syncState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (error) {
    console.error("[SYNC-STATE] Failed to update:", error);
  }
}

/**
 * Mark sync as completed.
 */
async function completeSyncState(
  supabase: SupabaseClient,
  connectionId: string,
  syncState: SyncState
): Promise<void> {
  const { error } = await supabase
    .from("email_connections")
    .update({
      sync_state: {
        ...syncState,
        status: "completed",
        current_page_token: null,
      },
      status: "active",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  if (error) {
    console.error("[SYNC-STATE] Failed to complete:", error);
  }
}

// ============================================================================
// PROCESS A PAGE OF EMAILS
// ============================================================================

/**
 * Process a page of email messages: fetch, score, classify, download, create files.
 * Returns the count of receipts found on this page.
 */
async function processEmailPage(
  supabase: SupabaseClient,
  connection: EmailConnection,
  accessToken: string,
  messageRefs: GmailMessageRef[],
  senderRules: SenderRule[],
  startTime: number
): Promise<{ receiptsFound: number; emailsProcessed: number }> {
  let receiptsFound = 0;
  let emailsProcessed = 0;

  for (const ref of messageRefs) {
    // Timeout guard: stop if approaching time limit
    if (Date.now() - startTime > TIMEOUT_GUARD_MS) {
      console.warn(
        "[PROCESS] Approaching timeout limit, stopping page processing at email",
        emailsProcessed,
        "of",
        messageRefs.length
      );
      break;
    }

    try {
      // Check for duplicate before fetching the full message
      const { data: existingFile } = await supabase
        .from("files")
        .select("id")
        .eq("email_message_id", ref.id)
        .eq("team_id", connection.team_id)
        .limit(1)
        .maybeSingle();

      if (existingFile) {
        console.log("[PROCESS] Skipping duplicate email:", ref.id);
        emailsProcessed++;
        continue;
      }

      // Fetch full message
      const message = await getMessage(accessToken, ref.id);
      emailsProcessed++;

      // Rule-based scoring
      const ruleScore = scoreEmail(message, senderRules);
      console.log(
        "[PROCESS] Email:",
        ref.id,
        "Score:",
        ruleScore,
        "Subject:",
        (getHeader(message, "Subject") || "").substring(0, 60)
      );

      // Decision based on score
      let isReceipt = false;

      if (ruleScore >= 95) {
        // Auto-accept
        isReceipt = true;
        console.log("[PROCESS] Auto-accept (score >= 95)");
      } else if (ruleScore <= 5) {
        // Auto-reject
        isReceipt = false;
        console.log("[PROCESS] Auto-reject (score <= 5)");
      } else if (ruleScore >= 6 && ruleScore <= 94) {
        // Ambiguous zone: use AI double-read classification
        console.log("[PROCESS] Ambiguous score, using AI classification...");
        const aiResult = await aiDoubleReadClassification(message);

        // Combined decision: use AI result if confidence is reasonable
        if (aiResult.confidence >= 0.5 && aiResult.isReceipt) {
          isReceipt = true;
          console.log(
            "[PROCESS] AI classified as receipt, confidence:",
            aiResult.confidence
          );
        } else if (aiResult.confidence >= 0.5 && !aiResult.isReceipt) {
          isReceipt = false;
          console.log(
            "[PROCESS] AI classified as NOT receipt, confidence:",
            aiResult.confidence
          );
        } else {
          // Low AI confidence: fall back to rule score threshold
          isReceipt = ruleScore >= 40;
          console.log(
            "[PROCESS] Low AI confidence, using rule score threshold:",
            ruleScore >= 40
          );
        }
      }

      if (!isReceipt) {
        continue;
      }

      // Download receipt content
      const content = await downloadReceiptContent(accessToken, message);
      if (!content) {
        console.warn("[PROCESS] No downloadable content for receipt:", ref.id);
        continue;
      }

      // Create file record
      const fileId = await createFileFromEmail(
        supabase,
        connection.team_id,
        connection.user_id,
        message.id,
        content
      );

      if (fileId) {
        receiptsFound++;
        console.log("[PROCESS] Receipt saved, file_id:", fileId);
      }
    } catch (err) {
      if (err instanceof GmailRateLimitError) {
        console.warn("[PROCESS] Gmail rate limit hit, stopping page processing");
        // Re-throw rate limits so the caller can handle pagination state
        throw err;
      }
      // Log individual email errors but continue processing
      console.error("[PROCESS] Error processing email:", ref.id, err);
    }
  }

  return { receiptsFound, emailsProcessed };
}

// ============================================================================
// BUILD SEARCH QUERY
// ============================================================================

/**
 * Build a Gmail search query for receipt/invoice emails.
 */
function buildSearchQuery(dateFrom?: string, dateTo?: string): string {
  const financialTerms = [
    "receipt",
    "invoice",
    "order confirmation",
    "payment",
    "\u05d7\u05e9\u05d1\u05d5\u05e0\u05d9\u05ea",
    "\u05e7\u05d1\u05dc\u05d4",
    "\u05d0\u05d9\u05e9\u05d5\u05e8 \u05ea\u05e9\u05dc\u05d5\u05dd",
  ].join(" OR ");

  let query = `(${financialTerms}) OR (has:attachment (filename:pdf OR filename:jpg OR filename:png))`;

  if (dateFrom) {
    // Gmail date format: YYYY/MM/DD
    const formatted = dateFrom.replace(/-/g, "/");
    query += ` after:${formatted}`;
  }

  if (dateTo) {
    const formatted = dateTo.replace(/-/g, "/");
    query += ` before:${formatted}`;
  }

  return query;
}

// ============================================================================
// 4h: MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log("=".repeat(60));
  console.log("[GMAIL-SYNC] Started at:", new Date().toISOString());

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("[GMAIL-SYNC] Missing Supabase env vars");
    return new Response(
      JSON.stringify({ success: false, error: "Server configuration error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  try {
    const body = await req.json();
    const mode: string = body.mode;

    if (mode !== "start" && mode !== "continue") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid mode. Use 'start' or 'continue'.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ==================================================================
    // MODE: START - User-initiated sync
    // ==================================================================
    if (mode === "start") {
      // Requires user authorization
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing authorization" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!supabaseAnonKey) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Server configuration error",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Authenticate user
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser();

      if (authError || !user) {
        console.error("[GMAIL-SYNC] Auth failed:", authError?.message);
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { team_id, connection_id, date_from, date_to } = body;

      if (!team_id || !connection_id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing required fields: team_id, connection_id",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Verify user is team admin
      const { data: membership, error: memberError } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user.id)
        .is("removed_at", null)
        .single();

      if (memberError || !membership) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "You are not a member of this team",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (membership.role !== "owner" && membership.role !== "admin") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Only team owners and admins can initiate email sync",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Fetch the connection
      const { data: connection, error: connError } = await supabase
        .from("email_connections")
        .select("*")
        .eq("id", connection_id)
        .eq("team_id", team_id)
        .single();

      if (connError || !connection) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Email connection not found",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Prevent starting a sync if one is already in progress
      const currentSyncState = connection.sync_state as SyncState | null;
      if (currentSyncState?.status === "syncing") {
        // Check for stale sync
        const syncStartedAt = new Date(
          currentSyncState.started_at
        ).getTime();
        if (Date.now() - syncStartedAt < STALE_SYNC_TIMEOUT_MS) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "A sync is already in progress",
              sync_state: currentSyncState,
            }),
            {
              status: 409,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        // Stale sync detected - allow restart
        console.warn(
          "[GMAIL-SYNC] Stale sync detected, restarting. Started at:",
          currentSyncState.started_at
        );
      }

      // Get a valid access token
      const typedConnection = connection as unknown as EmailConnection;
      const accessToken = await getValidAccessToken(typedConnection, supabase);

      // Build search query
      const searchQuery = buildSearchQuery(date_from, date_to);
      console.log("[GMAIL-SYNC] Search query:", searchQuery);

      // Set connection status to syncing
      const initialSyncState: SyncState = {
        status: "syncing",
        total_emails_estimated: 0,
        current_page_token: null,
        receipts_found: 0,
        emails_checked: 0,
        started_at: new Date().toISOString(),
        search_query: searchQuery,
      };

      await supabase
        .from("email_connections")
        .update({
          status: "syncing",
          sync_state: initialSyncState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection_id);

      // Search for first page
      const searchResult = await searchMessages(accessToken, searchQuery);

      // Update estimated total
      initialSyncState.total_emails_estimated =
        searchResult.resultSizeEstimate || 0;
      console.log(
        "[GMAIL-SYNC] Estimated total emails:",
        searchResult.resultSizeEstimate
      );

      if (!searchResult.messages || searchResult.messages.length === 0) {
        // No matching emails found
        console.log("[GMAIL-SYNC] No matching emails found");
        await completeSyncState(supabase, connection_id, initialSyncState);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Sync completed - no matching emails found",
            sync_state: {
              ...initialSyncState,
              status: "completed",
            },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Process first page
      const senderRules = (typedConnection.sender_rules || []) as SenderRule[];
      const pageResult = await processEmailPage(
        supabase,
        typedConnection,
        accessToken,
        searchResult.messages,
        senderRules,
        startTime
      );

      // Update sync state with progress
      const updatedSyncState: SyncState = {
        ...initialSyncState,
        current_page_token: searchResult.nextPageToken || null,
        receipts_found: pageResult.receiptsFound,
        emails_checked: pageResult.emailsProcessed,
      };

      if (!searchResult.nextPageToken) {
        // All done in one page
        await completeSyncState(supabase, connection_id, updatedSyncState);
        console.log("[GMAIL-SYNC] Sync completed in single page");
      } else {
        // More pages to process - save state for cron to continue
        await updateSyncState(supabase, connection_id, updatedSyncState);
        console.log(
          "[GMAIL-SYNC] First page complete, saved page_token for continuation"
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: searchResult.nextPageToken
            ? "First page processed, continuing in background"
            : "Sync completed",
          sync_state: updatedSyncState,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ==================================================================
    // MODE: CONTINUE - Called by pg_cron
    // ==================================================================
    if (mode === "continue") {
      console.log("[GMAIL-SYNC] Continue mode - looking for active syncs");

      // Find connections with status='syncing' that have a page token
      const { data: connections, error: fetchError } = await supabase
        .from("email_connections")
        .select("*")
        .eq("status", "syncing")
        .limit(1); // MAX 1 connection per invocation

      if (fetchError) {
        console.error(
          "[GMAIL-SYNC] Failed to fetch connections:",
          fetchError
        );
        throw new Error(
          `Failed to fetch connections: ${fetchError.message}`
        );
      }

      if (!connections || connections.length === 0) {
        console.log("[GMAIL-SYNC] No active syncs found");
        return new Response(
          JSON.stringify({
            success: true,
            message: "No active syncs to continue",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const connection = connections[0] as unknown as EmailConnection;
      const syncState = connection.sync_state as SyncState | null;

      if (!syncState || syncState.status !== "syncing") {
        console.log(
          "[GMAIL-SYNC] Connection has no active sync state:",
          connection.id
        );
        return new Response(
          JSON.stringify({
            success: true,
            message: "Connection sync state is not active",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check for stale sync
      const syncStartedAt = new Date(syncState.started_at).getTime();
      if (Date.now() - syncStartedAt > STALE_SYNC_TIMEOUT_MS) {
        console.warn(
          "[GMAIL-SYNC] Stale sync detected for connection:",
          connection.id
        );
        await supabase
          .from("email_connections")
          .update({
            status: "error",
            sync_state: {
              ...syncState,
              status: "failed",
              last_error:
                "Sync timed out - exceeded maximum sync duration",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);

        return new Response(
          JSON.stringify({
            success: false,
            error: "Stale sync detected and marked as failed",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (!syncState.current_page_token) {
        // No more pages - mark as completed
        console.log(
          "[GMAIL-SYNC] No page token, marking as completed:",
          connection.id
        );
        await completeSyncState(supabase, connection.id, syncState);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Sync completed - no more pages",
            sync_state: { ...syncState, status: "completed" },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get a valid access token
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(connection, supabase);
      } catch (tokenErr) {
        console.error(
          "[GMAIL-SYNC] Token error for connection:",
          connection.id,
          tokenErr
        );
        await supabase
          .from("email_connections")
          .update({
            status: "error",
            sync_state: {
              ...syncState,
              status: "failed",
              last_error: `Token error: ${tokenErr instanceof Error ? tokenErr.message : String(tokenErr)}`,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);
        throw tokenErr;
      }

      // Use the saved search query or rebuild it
      const searchQuery =
        syncState.search_query || buildSearchQuery();

      // Fetch next page
      const searchResult = await searchMessages(
        accessToken,
        searchQuery,
        syncState.current_page_token
      );

      if (!searchResult.messages || searchResult.messages.length === 0) {
        // No more messages - sync complete
        console.log("[GMAIL-SYNC] No more messages, sync complete");
        await completeSyncState(supabase, connection.id, syncState);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Sync completed - no more messages",
            sync_state: { ...syncState, status: "completed" },
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Process the page
      const senderRules = (connection.sender_rules || []) as SenderRule[];
      let pageResult: { receiptsFound: number; emailsProcessed: number };

      try {
        pageResult = await processEmailPage(
          supabase,
          connection,
          accessToken,
          searchResult.messages,
          senderRules,
          startTime
        );
      } catch (err) {
        if (err instanceof GmailRateLimitError) {
          // Rate limited - save current state, will retry on next cron invocation
          console.warn(
            "[GMAIL-SYNC] Rate limited during page processing, saving state for retry"
          );
          await updateSyncState(supabase, connection.id, {
            ...syncState,
            last_error: "Rate limited - will retry on next invocation",
          });
          return new Response(
            JSON.stringify({
              success: true,
              message: "Rate limited - will retry on next cron invocation",
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
        throw err;
      }

      // Update sync state
      const updatedSyncState: SyncState = {
        ...syncState,
        current_page_token: searchResult.nextPageToken || null,
        receipts_found:
          (syncState.receipts_found || 0) + pageResult.receiptsFound,
        emails_checked:
          (syncState.emails_checked || 0) + pageResult.emailsProcessed,
      };

      if (!searchResult.nextPageToken) {
        // All done
        await completeSyncState(supabase, connection.id, updatedSyncState);
        console.log("[GMAIL-SYNC] Sync fully completed");
      } else {
        // More pages - save for next cron invocation
        await updateSyncState(supabase, connection.id, updatedSyncState);
        console.log(
          "[GMAIL-SYNC] Page processed, saved state. Checked:",
          updatedSyncState.emails_checked,
          "Receipts:",
          updatedSyncState.receipts_found
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: searchResult.nextPageToken
            ? "Page processed, more to go"
            : "Sync completed",
          sync_state: updatedSyncState,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Should not reach here
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[GMAIL-SYNC] Fatal error:", err);
    console.error(
      "[GMAIL-SYNC] Error stack:",
      err instanceof Error ? err.stack : "no stack"
    );
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
