// Supabase Edge Function for handling Gmail Pub/Sub push notifications
// Processes new emails in real-time, applies rule-based scoring, and feeds
// receipts/invoices into the extraction pipeline.
import { createClient } from "npm:@supabase/supabase-js@2";
import { detectFinancialEmail } from "../_shared/email-ingestion/detectFinancialEmail.ts";
import { discoverDocumentCandidates } from "../_shared/email-ingestion/discoverCandidates.ts";
import {
  extractHtmlBody,
  sanitizeFilename,
} from "../_shared/email-ingestion/message.ts";
import { normalizeSenderRules } from "../_shared/email-ingestion/senderRules.ts";
import type {
  EmailCandidate,
} from "../_shared/email-ingestion/types.ts";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Gmail API base URL
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

const GEMINI_CLASSIFY_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_CLASSIFY_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CLASSIFY_MODEL}:generateContent`;

// Maximum messages to process per webhook invocation (keep it fast)
const MAX_MESSAGES_PER_WEBHOOK = 10;

// Download safety limits
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_REDIRECTS = 5;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "text/html",
]);

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
  sender_rules: unknown;
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

// ============================================================================
// SAFE REMOTE CONTENT DOWNLOAD
// ============================================================================

function mimeTypeToFileType(mimeType: string, filename: string): string {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (lowerMime === "image/png" || lowerName.endsWith(".png")) return "png";
  if (
    lowerMime === "image/jpeg" ||
    lowerMime === "image/jpg" ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg")
  ) {
    return "jpg";
  }
  if (lowerMime === "image/webp" || lowerName.endsWith(".webp")) return "webp";
  if (lowerMime === "text/html" || lowerName.endsWith(".html") || lowerName.endsWith(".htm")) return "html";
  return "pdf";
}

interface DownloadedContent {
  blob: Uint8Array;
  filename: string;
  mimeType: string;
}

async function downloadRemoteContent(url: string): Promise<DownloadedContent | null> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    const response = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "VAT-Declaration-Manager/Email-Ingestion",
        "Accept": "application/pdf,image/*,text/html",
      },
    });

    // Handle redirects manually
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        console.warn("[DOWNLOAD] Redirect without location header");
        return null;
      }
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Remote download failed: ${response.status}`);
    }

    // Pre-check content type
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      console.warn("[DOWNLOAD] Rejected content-type:", contentType, "from:", currentUrl);
      return null;
    }

    // Pre-check content length if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
      console.warn("[DOWNLOAD] File too large:", contentLength, "bytes from:", currentUrl);
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_SIZE) {
      console.warn("[DOWNLOAD] Downloaded content too large:", bytes.length, "bytes");
      return null;
    }

    const finalUrl = new URL(currentUrl);
    console.log("[DOWNLOAD] Fetched from domain:", finalUrl.hostname, "size:", bytes.length);
    const suggestedName = sanitizeFilename(finalUrl.pathname.split("/").pop() || "linked-invoice");

    const extension = mimeTypeToFileType(contentType, suggestedName);
    const filename = suggestedName.includes(".") ? suggestedName : `${suggestedName}.${extension}`;

    return {
      blob: bytes,
      filename,
      mimeType: contentType,
    };
  }

  console.warn("[DOWNLOAD] Too many redirects for:", url);
  return null;
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
  if (lower.endsWith(".html") || lower.endsWith(".htm") || mimeType === "text/html") return "html";
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
 * Upload a candidate to Supabase Storage, create a files record,
 * and trigger the extract-invoice function.
 */
async function processCandidate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  messageId: string,
  message: GmailMessage,
  candidate: EmailCandidate,
  connection: EmailConnection,
  detection: { label: "yes" | "maybe" | "no"; confidence: number; reason: string },
): Promise<{ fileId: string } | null> {
  let bytes: Uint8Array;
  let mimeType: string;
  let originalName: string;

  if (candidate.kind === "attachment") {
    bytes = await downloadAttachment(accessToken, messageId, candidate.attachmentId);
    mimeType = candidate.mimeType;
    originalName = candidate.filename;
  } else if (candidate.kind === "html_body") {
    const html = extractHtmlBody(message.payload);
    if (!html) return null;
    bytes = new TextEncoder().encode(html);
    mimeType = "text/html";
    originalName = candidate.filename;
  } else {
    const downloaded = await downloadRemoteContent(candidate.url);
    if (!downloaded) {
      console.log("[GMAIL-WEBHOOK] Remote download rejected or failed for:", candidate.url);
      return null;
    }
    bytes = downloaded.blob;
    mimeType = downloaded.mimeType;
    originalName = downloaded.filename;
  }

  const fileType = getFileType(mimeType, originalName);
  if (!fileType) {
    console.log(
      "[GMAIL-WEBHOOK] Skipping unsupported candidate type:",
      candidate.kind,
      mimeType,
      originalName
    );
    return null;
  }

  console.log(
    "[GMAIL-WEBHOOK] Processing candidate:",
    candidate.kind,
    originalName,
    "type:",
    fileType
  );

  // Compute file hash for deduplication
  const fileHash = await computeFileHash(bytes);

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
  const identityKey = candidate.kind === "attachment"
    ? candidate.attachmentId
    : candidate.kind === "download_link"
      ? sanitizeFilename(candidate.url)
      : "html_body";
  const storagePath = `${connection.team_id}/${connection.user_id}/email/${messageId}/${identityKey}/${originalName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, {
      contentType: mimeType,
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
      email_attachment_id: candidate.kind === "attachment" ? candidate.attachmentId : null,
      email_content_kind: candidate.kind,
      email_source_url: candidate.kind === "download_link" ? candidate.url : null,
      email_detection_label: detection.label,
      email_detection_confidence: detection.confidence,
      email_detection_reason: detection.reason,
      email_discovery_metadata: JSON.parse(JSON.stringify(candidate)),
      file_hash: fileHash,
      file_size: bytes.length,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique constraint violation means this candidate was already processed
    if (insertError.code === "23505") {
      console.log(
        "[GMAIL-WEBHOOK] Duplicate email candidate, already processed:",
        messageId,
        candidate.kind
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
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const extractResp = await fetch(
      `${supabaseUrl}/functions/v1/extract-invoice`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseAnonKey,
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
  // Fetch full message
  const message = await fetchGmailMessage(accessToken, gmailMessageId);
  const normalizedRules = normalizeSenderRules(connection.sender_rules);
  const candidates = discoverDocumentCandidates(message);
  if (candidates.length === 0) {
    return { processed: false, score: 0, fileIds: [] };
  }

  const detection = await detectFinancialEmail(
    Deno.env.get("GEMINI_API_KEY"),
    message,
    candidates,
    normalizedRules,
    GEMINI_CLASSIFY_URL,
  );
  const subject = getHeader(message.payload, "Subject") || "(no subject)";

  console.log(
    `[GMAIL-WEBHOOK] Message ${gmailMessageId}: label=${detection.label}, confidence=${detection.confidence}, subject="${subject.substring(0, 60)}", candidates=${candidates.length}`
  );

  if (detection.label === "no") {
    return { processed: false, score: 0, fileIds: [] };
  }

  const fileIds: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await processCandidate(
        supabase,
        accessToken,
        gmailMessageId,
        message,
        candidate,
        connection,
        detection,
      );
      if (result) {
        fileIds.push(result.fileId);
      }
    } catch (attError) {
      console.error(
        "[GMAIL-WEBHOOK] Failed to process candidate:",
        candidate.kind,
        attError
      );
      // Continue with other candidates
    }
  }

  return { processed: fileIds.length > 0, score: detection.confidence, fileIds };
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
