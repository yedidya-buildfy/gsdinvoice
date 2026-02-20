// Supabase Edge Function for handling Gmail Pub/Sub push notifications
// Processes new emails in real-time, applies rule-based scoring, and feeds
// receipts/invoices into the extraction pipeline.
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Gmail API base URL
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

// Rule-based scoring threshold for webhook (lower than full sync since we skip AI)
const WEBHOOK_SCORE_THRESHOLD = 40;

// Maximum messages to process per webhook invocation (keep it fast)
const MAX_MESSAGES_PER_WEBHOOK = 10;

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Decrypt an AES-GCM encrypted token stored as base64(iv + ciphertext)
 */
async function decryptToken(encrypted: string): Promise<string> {
  const keyHex = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
  const keyBytes = new Uint8Array(
    keyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const raw = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Encrypt a string using AES-GCM. Returns base64(iv + ciphertext).
 */
async function encryptToken(plaintext: string): Promise<string> {
  const keyHex = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
  const keyBytes = new Uint8Array(
    keyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const key = await crypto.subtle.importKey(
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
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

interface EmailConnection {
  id: string;
  team_id: string;
  user_id: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  last_history_id: string | null;
  status: string;
  sender_rules: SenderRule[] | null;
}

interface SenderRule {
  domain?: string;
  email?: string;
  rule: "always_trust" | "always_ignore";
}

/**
 * Refresh the OAuth2 access token using the refresh token.
 * Updates the database with the new encrypted access token and expiry.
 * Returns the new plaintext access token.
 */
async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: EmailConnection
): Promise<string> {
  console.log(
    "[GMAIL-WEBHOOK] Refreshing access token for:",
    connection.email_address
  );

  const refreshToken = await decryptToken(connection.refresh_token);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error("[GMAIL-WEBHOOK] Token refresh failed:", resp.status, errorText);

    // If refresh token is revoked or invalid, mark connection as revoked
    if (resp.status === 400 || resp.status === 401) {
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = {};
      }
      if (
        errorData.error === "invalid_grant" ||
        errorData.error === "unauthorized"
      ) {
        console.error(
          "[GMAIL-WEBHOOK] Refresh token revoked, marking connection as revoked"
        );
        await supabase
          .from("email_connections")
          .update({ status: "revoked", updated_at: new Date().toISOString() })
          .eq("id", connection.id);
      }
    }

    throw new Error(`Token refresh failed: ${resp.status}`);
  }

  const tokenData = await resp.json();
  const newAccessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 3600;

  // Encrypt and store the new access token
  const encryptedToken = await encryptToken(newAccessToken);
  const tokenExpiresAt = new Date(
    Date.now() + expiresIn * 1000
  ).toISOString();

  await supabase
    .from("email_connections")
    .update({
      access_token: encryptedToken,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  console.log("[GMAIL-WEBHOOK] Token refreshed successfully");
  return newAccessToken;
}

/**
 * Get a valid access token, refreshing if expired or expiring soon.
 */
async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: EmailConnection
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5-minute buffer

  if (expiresAt - now < bufferMs) {
    return await refreshAccessToken(supabase, connection);
  }

  return await decryptToken(connection.access_token);
}

// ============================================================================
// GMAIL API HELPERS
// ============================================================================

interface GmailHistory {
  id: string;
  messagesAdded?: Array<{
    message: {
      id: string;
      threadId: string;
      labelIds?: string[];
    };
  }>;
}

interface GmailHistoryResponse {
  history?: GmailHistory[];
  historyId: string;
  nextPageToken?: string;
}

/**
 * Fetch Gmail history since a given historyId, filtering for messageAdded events.
 */
async function fetchGmailHistory(
  accessToken: string,
  startHistoryId: string
): Promise<GmailHistoryResponse> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
    labelIds: "INBOX",
    maxResults: String(MAX_MESSAGES_PER_WEBHOOK),
  });

  const resp = await fetch(`${GMAIL_API_BASE}/history?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    // 404 means historyId is too old; we need to do a full sync
    if (resp.status === 404) {
      console.warn(
        "[GMAIL-WEBHOOK] History ID too old (404). Returning empty history with updated ID."
      );
      // Return empty - the backstop or a full sync will catch up
      return { historyId: startHistoryId };
    }
    throw new Error(`Gmail History API error: ${resp.status} - ${errorText}`);
  }

  return await resp.json();
}

interface GmailMessagePayload {
  mimeType: string;
  headers: Array<{ name: string; value: string }>;
  parts?: GmailMessagePayload[];
  body?: {
    attachmentId?: string;
    size: number;
    data?: string;
  };
  filename?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: GmailMessagePayload;
  internalDate: string;
}

/**
 * Fetch a single Gmail message with metadata and payload.
 */
async function fetchGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const resp = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(
      `Gmail message fetch error: ${resp.status} - ${errorText}`
    );
  }

  return await resp.json();
}

/**
 * Download a Gmail attachment by ID.
 */
async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const resp = await fetch(
    `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(
      `Attachment download error: ${resp.status} - ${errorText}`
    );
  }

  const data = await resp.json();
  // Gmail returns base64url-encoded data
  const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// MESSAGE HEADER HELPERS
// ============================================================================

function getHeader(
  payload: GmailMessagePayload,
  name: string
): string | null {
  const header = payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? null;
}

function extractSenderEmail(fromHeader: string): string {
  // "John Doe <john@example.com>" -> "john@example.com"
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).toLowerCase().trim();
}

function extractSenderDomain(email: string): string {
  const parts = email.split("@");
  return parts.length > 1 ? parts[1].toLowerCase() : "";
}

// ============================================================================
// RULE-BASED SCORING
// ============================================================================

// Known receipt/billing sender patterns
const BILLING_SENDER_PREFIXES = [
  "billing",
  "receipts",
  "receipt",
  "noreply",
  "no-reply",
  "no_reply",
  "invoice",
  "invoices",
  "payments",
  "payment",
  "orders",
  "order",
  "accounting",
  "finance",
  "accounts",
  "support",
  "statement",
  "statements",
];

// Known receipt vendor domains
const KNOWN_VENDOR_DOMAINS = [
  "paypal.com",
  "stripe.com",
  "square.com",
  "intuit.com",
  "quickbooks.com",
  "freshbooks.com",
  "xero.com",
  "wix.com",
  "shopify.com",
  "amazon.com",
  "google.com",
  "apple.com",
  "microsoft.com",
  "adobe.com",
  "digitalocean.com",
  "aws.amazon.com",
  "heroku.com",
  "github.com",
  "atlassian.com",
  "slack.com",
  "zoom.us",
  "dropbox.com",
  "notion.so",
  "figma.com",
  "vercel.com",
  "netlify.com",
  "render.com",
  "cloudflare.com",
  "godaddy.com",
  "namecheap.com",
  "hover.com",
  "twilio.com",
  "sendgrid.com",
  "mailchimp.com",
  "hubspot.com",
  "intercom.com",
  "zendesk.com",
  "monday.com",
  "facebook.com",
  "meta.com",
  "facebookmail.com",
  // Israeli vendors
  "isracard.co.il",
  "leumi.co.il",
  "poalim.co.il",
  "discount.co.il",
  "mizrahi-tefahot.co.il",
  "cal-online.co.il",
  "max.co.il",
  "bezeq.co.il",
  "partner.co.il",
  "cellcom.co.il",
  "hot.net.il",
  "yes.co.il",
  "orange.co.il",
  "pelephone.co.il",
  "bezek.co.il",
  "electric.co.il",
  "iec.co.il",
];

// Subject keywords indicating a receipt/invoice
const RECEIPT_SUBJECT_KEYWORDS = [
  "receipt",
  "invoice",
  "payment",
  "order confirmation",
  "billing",
  "statement",
  "subscription",
  "charge",
  "transaction",
  "purchase",
  "tax invoice",
  // Hebrew
  "חשבונית",
  "קבלה",
  "אישור תשלום",
  "אישור הזמנה",
  "חיוב",
  "דף חשבון",
  "מנוי",
  "עסקה",
  "חשבונית מס",
];

// Negative keywords (marketing, shipping, etc.)
const NEGATIVE_SUBJECT_KEYWORDS = [
  "unsubscribe",
  "newsletter",
  "sale",
  "discount",
  "promo",
  "% off",
  "free shipping",
  "flash sale",
  "limited time",
  "deal of the day",
  "tracking number",
  "shipped",
  "out for delivery",
  "delivered",
  "security alert",
  "password reset",
  "verify your email",
  "welcome to",
];

// Supported attachment types for invoice/receipt documents
const RECEIPT_ATTACHMENT_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

/**
 * Check if a message has receipt-like attachments (PDF/image).
 */
function hasReceiptAttachments(payload: GmailMessagePayload): boolean {
  const attachments = collectAttachments(payload);
  return attachments.some((att) => {
    const filename = (att.filename || "").toLowerCase();
    return RECEIPT_ATTACHMENT_EXTENSIONS.some((ext) =>
      filename.endsWith(ext)
    );
  });
}

interface AttachmentInfo {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

/**
 * Collect all attachments from a message payload (recursively through parts).
 */
function collectAttachments(payload: GmailMessagePayload): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];

  function walk(part: GmailMessagePayload) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size || 0,
      });
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        walk(subPart);
      }
    }
  }

  walk(payload);
  return attachments;
}

/**
 * Score a message using rule-based heuristics (0-100).
 * Higher score = more likely a receipt/invoice.
 */
function scoreMessage(
  message: GmailMessage,
  senderRules: SenderRule[] | null
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const from = getHeader(message.payload, "From") || "";
  const subject = (getHeader(message.payload, "Subject") || "").toLowerCase();
  const senderEmail = extractSenderEmail(from);
  const senderDomain = extractSenderDomain(senderEmail);
  const senderPrefix = senderEmail.split("@")[0] || "";

  // --- User-defined sender rules (highest priority) ---
  if (senderRules && senderRules.length > 0) {
    for (const rule of senderRules) {
      const matchesDomain =
        rule.domain && senderDomain === rule.domain.toLowerCase();
      const matchesEmail =
        rule.email && senderEmail === rule.email.toLowerCase();

      if (matchesDomain || matchesEmail) {
        if (rule.rule === "always_trust") {
          score += 50;
          reasons.push(`Trusted sender rule: ${rule.domain || rule.email}`);
        } else if (rule.rule === "always_ignore") {
          return { score: 0, reasons: ["Ignored sender rule"] };
        }
      }
    }
  }

  // --- Sender analysis ---
  // Known billing sender prefix
  if (
    BILLING_SENDER_PREFIXES.some(
      (prefix) =>
        senderPrefix === prefix || senderPrefix.startsWith(`${prefix}.`)
    )
  ) {
    score += 15;
    reasons.push(`Billing sender prefix: ${senderPrefix}`);
  }

  // Known vendor domain
  if (KNOWN_VENDOR_DOMAINS.includes(senderDomain)) {
    score += 10;
    reasons.push(`Known vendor domain: ${senderDomain}`);
  }

  // --- Subject analysis ---
  const subjectLower = subject;

  // Positive keywords
  let positiveKeywordMatches = 0;
  for (const keyword of RECEIPT_SUBJECT_KEYWORDS) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      positiveKeywordMatches++;
    }
  }
  if (positiveKeywordMatches > 0) {
    score += Math.min(positiveKeywordMatches * 10, 25);
    reasons.push(`Subject keywords matched: ${positiveKeywordMatches}`);
  }

  // Negative keywords (reduce score)
  let negativeKeywordMatches = 0;
  for (const keyword of NEGATIVE_SUBJECT_KEYWORDS) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      negativeKeywordMatches++;
    }
  }
  if (negativeKeywordMatches > 0) {
    score -= Math.min(negativeKeywordMatches * 15, 30);
    reasons.push(`Negative keywords matched: ${negativeKeywordMatches}`);
  }

  // --- Attachment analysis ---
  if (hasReceiptAttachments(message.payload)) {
    score += 20;
    reasons.push("Has PDF/image attachment");
  }

  // --- Amount/price patterns in subject ---
  const amountPattern = /[$\u20AA\u20AC\u00A3]\s*[\d,]+\.?\d*|\d+[.,]\d{2}\s*(ILS|NIS|USD|EUR|GBP)/i;
  if (amountPattern.test(subject)) {
    score += 10;
    reasons.push("Subject contains monetary amount");
  }

  // --- Invoice/order number patterns in subject ---
  const invoiceNumPattern = /(invoice|order|receipt|confirmation)\s*#?\s*[\d-]+/i;
  if (invoiceNumPattern.test(subject)) {
    score += 10;
    reasons.push("Subject contains invoice/order number");
  }

  // Clamp score to 0-100
  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

// ============================================================================
// FILE CREATION & EXTRACTION TRIGGER
// ============================================================================

/**
 * Determine the file type from MIME type or filename.
 */
function getFileType(mimeType: string, filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".png") || mimeType === "image/png") return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mimeType === "image/jpeg") return "jpg";
  if (lower.endsWith(".webp") || mimeType === "image/webp") return "webp";
  return null;
}

/**
 * Compute SHA-256 hash of file bytes for deduplication.
 */
async function computeFileHash(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload an attachment to Supabase Storage, create a files record,
 * and trigger the extract-invoice function.
 */
async function processAttachment(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  messageId: string,
  attachment: AttachmentInfo,
  connection: EmailConnection
): Promise<{ fileId: string } | null> {
  const fileType = getFileType(attachment.mimeType, attachment.filename);
  if (!fileType) {
    console.log(
      "[GMAIL-WEBHOOK] Skipping unsupported attachment type:",
      attachment.mimeType,
      attachment.filename
    );
    return null;
  }

  console.log(
    "[GMAIL-WEBHOOK] Processing attachment:",
    attachment.filename,
    "type:",
    fileType
  );

  // Download attachment content
  const fileBytes = await downloadAttachment(
    accessToken,
    messageId,
    attachment.attachmentId
  );

  // Compute file hash for deduplication
  const fileHash = await computeFileHash(fileBytes);

  // Check for duplicate file hash within the team
  const { data: existingHash } = await supabase
    .from("files")
    .select("id")
    .eq("team_id", connection.team_id)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();

  if (existingHash) {
    console.log(
      "[GMAIL-WEBHOOK] Duplicate file hash detected, skipping:",
      fileHash.substring(0, 16)
    );
    return null;
  }

  // Upload to Supabase Storage
  const storagePath = `${connection.team_id}/${connection.user_id}/email/${messageId}/${attachment.filename}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, fileBytes, {
      contentType: attachment.mimeType,
      upsert: false,
    });

  if (uploadError) {
    // If file already exists in storage, that's fine (idempotent)
    if (uploadError.message?.includes("already exists")) {
      console.log(
        "[GMAIL-WEBHOOK] File already in storage (idempotent):",
        storagePath
      );
    } else {
      console.error("[GMAIL-WEBHOOK] Storage upload failed:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
  }

  // Create files record
  const originalName = attachment.filename || `email-attachment-${messageId}.${fileType}`;

  const { data: fileRecord, error: insertError } = await supabase
    .from("files")
    .insert({
      user_id: connection.user_id,
      team_id: connection.team_id,
      original_name: originalName,
      file_type: fileType,
      storage_path: storagePath,
      source_type: "invoice",
      source: "email",
      email_message_id: messageId,
      file_hash: fileHash,
      file_size: fileBytes.length,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique constraint violation on email_message_id means already processed
    if (insertError.code === "23505") {
      console.log(
        "[GMAIL-WEBHOOK] Duplicate email_message_id, already processed:",
        messageId
      );
      return null;
    }
    console.error("[GMAIL-WEBHOOK] Files insert error:", insertError);
    throw new Error(`Files insert failed: ${insertError.message}`);
  }

  console.log("[GMAIL-WEBHOOK] File record created:", fileRecord.id);

  // Trigger extract-invoice Edge Function (fire and forget)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const extractResp = await fetch(
      `${supabaseUrl}/functions/v1/extract-invoice`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          file_id: fileRecord.id,
          storage_path: storagePath,
          file_type: fileType,
        }),
      }
    );

    if (!extractResp.ok) {
      const errorText = await extractResp.text();
      console.error(
        "[GMAIL-WEBHOOK] extract-invoice trigger failed:",
        extractResp.status,
        errorText
      );
      // Don't throw -- the file is created and can be retried later
    } else {
      console.log(
        "[GMAIL-WEBHOOK] extract-invoice triggered for file:",
        fileRecord.id
      );
    }
  } catch (triggerError) {
    console.error(
      "[GMAIL-WEBHOOK] Failed to trigger extract-invoice:",
      triggerError
    );
    // Non-fatal -- file record exists for retry
  }

  return { fileId: fileRecord.id };
}

/**
 * Process a single Gmail message: score it, and if it looks like a receipt,
 * extract attachments and feed them into the pipeline.
 */
async function processMessage(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  gmailMessageId: string,
  connection: EmailConnection
): Promise<{ processed: boolean; score: number; fileIds: string[] }> {
  // Check deduplication first -- has this message already been processed?
  const { data: existingFile } = await supabase
    .from("files")
    .select("id")
    .eq("team_id", connection.team_id)
    .eq("email_message_id", gmailMessageId)
    .limit(1)
    .maybeSingle();

  if (existingFile) {
    console.log(
      "[GMAIL-WEBHOOK] Message already processed:",
      gmailMessageId
    );
    return { processed: false, score: 0, fileIds: [] };
  }

  // Fetch full message
  const message = await fetchGmailMessage(accessToken, gmailMessageId);

  // Apply rule-based scoring
  const { score, reasons } = scoreMessage(message, connection.sender_rules);
  const subject = getHeader(message.payload, "Subject") || "(no subject)";

  console.log(
    `[GMAIL-WEBHOOK] Message ${gmailMessageId}: score=${score}, subject="${subject.substring(0, 60)}", reasons=[${reasons.join(", ")}]`
  );

  if (score < WEBHOOK_SCORE_THRESHOLD) {
    console.log(
      `[GMAIL-WEBHOOK] Score ${score} < threshold ${WEBHOOK_SCORE_THRESHOLD}, skipping`
    );
    return { processed: false, score, fileIds: [] };
  }

  // Score is high enough -- process attachments
  const attachments = collectAttachments(message.payload);
  const receiptAttachments = attachments.filter((att) => {
    const filename = (att.filename || "").toLowerCase();
    return RECEIPT_ATTACHMENT_EXTENSIONS.some((ext) =>
      filename.endsWith(ext)
    );
  });

  if (receiptAttachments.length === 0) {
    console.log(
      "[GMAIL-WEBHOOK] No receipt attachments found in message:",
      gmailMessageId
    );
    return { processed: false, score, fileIds: [] };
  }

  const fileIds: string[] = [];

  for (const attachment of receiptAttachments) {
    try {
      const result = await processAttachment(
        supabase,
        accessToken,
        gmailMessageId,
        attachment,
        connection
      );
      if (result) {
        fileIds.push(result.fileId);
      }
    } catch (attError) {
      console.error(
        "[GMAIL-WEBHOOK] Failed to process attachment:",
        attachment.filename,
        attError
      );
      // Continue with other attachments
    }
  }

  return { processed: fileIds.length > 0, score, fileIds };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Google Pub/Sub only sends POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  console.log("=".repeat(60));
  console.log("[GMAIL-WEBHOOK] Push notification received");
  console.log("[GMAIL-WEBHOOK] Timestamp:", new Date().toISOString());

  // Always return 200 quickly to acknowledge the Pub/Sub message.
  // Google Pub/Sub retries on non-2xx, so we must ack even on errors.
  try {
    // Validate environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const tokenEncryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (
      !supabaseUrl ||
      !supabaseServiceKey ||
      !tokenEncryptionKey ||
      !googleClientId ||
      !googleClientSecret
    ) {
      console.error("[GMAIL-WEBHOOK] Missing required environment variables");
      // Return 200 to stop Pub/Sub retries -- config error won't fix itself
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse Pub/Sub message
    let body;
    try {
      body = await req.json();
    } catch {
      console.error("[GMAIL-WEBHOOK] Failed to parse request body");
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!body.message?.data) {
      console.error("[GMAIL-WEBHOOK] No message.data in request body");
      return new Response(
        JSON.stringify({ error: "Missing message data" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Decode the Pub/Sub message data (base64 -> JSON)
    let notification: { emailAddress: string; historyId: string };
    try {
      const decoded = atob(body.message.data);
      notification = JSON.parse(decoded);
    } catch (decodeError) {
      console.error(
        "[GMAIL-WEBHOOK] Failed to decode Pub/Sub message:",
        decodeError
      );
      return new Response(
        JSON.stringify({ error: "Invalid message data" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      "[GMAIL-WEBHOOK] Notification for:",
      notification.emailAddress,
      "historyId:",
      notification.historyId
    );

    // Initialize Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find matching email connection
    const { data: connection, error: connError } = await supabase
      .from("email_connections")
      .select("*")
      .eq("email_address", notification.emailAddress)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (connError) {
      console.error(
        "[GMAIL-WEBHOOK] Database query error:",
        connError.message
      );
      return new Response(
        JSON.stringify({ error: "Database error" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!connection) {
      console.log(
        "[GMAIL-WEBHOOK] No active connection found for:",
        notification.emailAddress,
        "-- acknowledging to stop retries"
      );
      return new Response(
        JSON.stringify({ acknowledged: true, reason: "no_active_connection" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      "[GMAIL-WEBHOOK] Found connection:",
      connection.id,
      "team:",
      connection.team_id,
      "last_history_id:",
      connection.last_history_id
    );

    // If we don't have a last_history_id, we can't do delta sync.
    // Use the notification's historyId as the starting point for future syncs.
    if (!connection.last_history_id) {
      console.log(
        "[GMAIL-WEBHOOK] No last_history_id, setting from notification and returning"
      );
      await supabase
        .from("email_connections")
        .update({
          last_history_id: notification.historyId,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return new Response(
        JSON.stringify({
          acknowledged: true,
          action: "initialized_history_id",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get a valid access token (refresh if needed)
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(supabase, connection);
    } catch (tokenError) {
      console.error(
        "[GMAIL-WEBHOOK] Failed to get access token:",
        tokenError
      );
      return new Response(
        JSON.stringify({ error: "Token error" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch history changes since our last known historyId
    let historyResponse: GmailHistoryResponse;
    try {
      historyResponse = await fetchGmailHistory(
        accessToken,
        connection.last_history_id
      );
    } catch (historyError) {
      console.error(
        "[GMAIL-WEBHOOK] History API error:",
        historyError
      );
      return new Response(
        JSON.stringify({ error: "History API error" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Collect unique new message IDs
    const newMessageIds = new Set<string>();
    if (historyResponse.history) {
      for (const historyRecord of historyResponse.history) {
        if (historyRecord.messagesAdded) {
          for (const added of historyRecord.messagesAdded) {
            // Only process INBOX messages
            if (
              added.message.labelIds &&
              added.message.labelIds.includes("INBOX")
            ) {
              newMessageIds.add(added.message.id);
            }
          }
        }
      }
    }

    console.log(
      "[GMAIL-WEBHOOK] New messages found:",
      newMessageIds.size
    );

    // Process each new message
    let processedCount = 0;
    let skippedCount = 0;
    const allFileIds: string[] = [];

    for (const msgId of newMessageIds) {
      try {
        const result = await processMessage(
          supabase,
          accessToken,
          msgId,
          connection
        );

        if (result.processed) {
          processedCount++;
          allFileIds.push(...result.fileIds);
        } else {
          skippedCount++;
        }
      } catch (msgError) {
        console.error(
          `[GMAIL-WEBHOOK] Failed to process message ${msgId}:`,
          msgError
        );
        skippedCount++;
        // Continue with other messages
      }
    }

    // Update the connection with the new history ID and sync timestamp
    const updatePayload: Record<string, unknown> = {
      last_history_id: historyResponse.historyId,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("email_connections")
      .update(updatePayload)
      .eq("id", connection.id);

    console.log(
      `[GMAIL-WEBHOOK] Complete. Processed: ${processedCount}, Skipped: ${skippedCount}, Files created: ${allFileIds.length}`
    );
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({
        acknowledged: true,
        messages_found: newMessageIds.size,
        processed: processedCount,
        skipped: skippedCount,
        files_created: allFileIds.length,
        new_history_id: historyResponse.historyId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    // Catch-all: always return 200 to prevent Pub/Sub infinite retries
    console.error(
      "[GMAIL-WEBHOOK] Unexpected error:",
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : ""
    );
    return new Response(
      JSON.stringify({
        acknowledged: true,
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
