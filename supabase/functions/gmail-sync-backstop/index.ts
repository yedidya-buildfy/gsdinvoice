// Supabase Edge Function for catching missed Gmail push notifications.
// Runs every 30 minutes via pg_cron. Queries active email connections that
// haven't synced recently, then uses the Gmail History API to process any
// new messages that were missed by the webhook.
import { createClient } from "npm:@supabase/supabase-js@2";
import { detectFinancialEmail } from "../_shared/email-ingestion/detectFinancialEmail.ts";
import { discoverDocumentCandidates } from "../_shared/email-ingestion/discoverCandidates.ts";
import {
  extractHtmlBody,
  sanitizeFilename,
} from "../_shared/email-ingestion/message.ts";
import { normalizeSenderRules } from "../_shared/email-ingestion/senderRules.ts";
import type { EmailCandidate } from "../_shared/email-ingestion/types.ts";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Gmail API base URL
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

// Maximum connections to process per invocation
const MAX_CONNECTIONS_PER_RUN = 5;

// Maximum messages to process per connection
const MAX_MESSAGES_PER_CONNECTION = 20;

// Stale sync threshold in minutes
const STALE_SYNC_THRESHOLD_MINUTES = 30;

const GEMINI_CLASSIFY_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_CLASSIFY_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CLASSIFY_MODEL}:generateContent`;

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
  last_sync_at: string | null;
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
    "[GMAIL-BACKSTOP] Refreshing access token for:",
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
    console.error(
      "[GMAIL-BACKSTOP] Token refresh failed:",
      resp.status,
      errorText
    );

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
          "[GMAIL-BACKSTOP] Refresh token revoked, marking connection as revoked"
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

  console.log("[GMAIL-BACKSTOP] Token refreshed successfully");
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
  const bufferMs = 5 * 60 * 1000;

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
 * Fetch Gmail history since a given historyId.
 */
async function fetchGmailHistory(
  accessToken: string,
  startHistoryId: string,
  pageToken?: string
): Promise<GmailHistoryResponse> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
    maxResults: String(MAX_MESSAGES_PER_CONNECTION),
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const resp = await fetch(`${GMAIL_API_BASE}/history?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    if (resp.status === 404) {
      console.warn(
        "[GMAIL-BACKSTOP] History ID too old (404). Need full re-sync."
      );
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
 * Fetch a single Gmail message.
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
        "User-Agent": "BillSync/Email-Ingestion",
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
// FILE CREATION
// ============================================================================

function getFileType(mimeType: string, filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".png") || mimeType === "image/png") return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || mimeType === "image/jpeg") return "jpg";
  if (lower.endsWith(".webp") || mimeType === "image/webp") return "webp";
  if (lower.endsWith(".html") || lower.endsWith(".htm") || mimeType === "text/html") return "html";
  return null;
}

async function computeFileHash(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function processCandidate(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  messageId: string,
  message: GmailMessage,
  candidate: EmailCandidate,
  connection: EmailConnection,
  detection: { label: "yes" | "maybe" | "no"; confidence: number; reason: string },
): Promise<{ fileId: string } | null> {
  let fileBytes: Uint8Array;
  let mimeType: string;
  let originalName: string;

  if (candidate.kind === "attachment") {
    fileBytes = await downloadAttachment(accessToken, messageId, candidate.attachmentId);
    mimeType = candidate.mimeType;
    originalName = candidate.filename;
  } else if (candidate.kind === "html_body") {
    const html = extractHtmlBody(message.payload);
    if (!html) return null;
    fileBytes = new TextEncoder().encode(html);
    mimeType = "text/html";
    originalName = candidate.filename;
  } else {
    const downloaded = await downloadRemoteContent(candidate.url);
    if (!downloaded) {
      console.log("[GMAIL-BACKSTOP] Remote download rejected or failed for:", candidate.url);
      return null;
    }
    fileBytes = downloaded.blob;
    mimeType = downloaded.mimeType;
    originalName = downloaded.filename;
  }

  const fileType = getFileType(mimeType, originalName);
  if (!fileType) {
    console.log(
      "[GMAIL-BACKSTOP] Skipping unsupported candidate:",
      candidate.kind,
      mimeType,
      originalName
    );
    return null;
  }

  console.log(
    "[GMAIL-BACKSTOP] Processing candidate:",
    candidate.kind,
    originalName,
    "type:",
    fileType
  );

  const fileHash = await computeFileHash(fileBytes);

  // Check file hash deduplication
  const { data: existingHash } = await supabase
    .from("files")
    .select("id")
    .eq("team_id", connection.team_id)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();

  if (existingHash) {
    console.log(
      "[GMAIL-BACKSTOP] Duplicate file hash, skipping:",
      fileHash.substring(0, 16)
    );
    return null;
  }

  // Upload to storage
  const identityKey = candidate.kind === "attachment"
    ? candidate.attachmentId
    : candidate.kind === "download_link"
      ? sanitizeFilename(candidate.url)
      : "html_body";
  const storagePath = `${connection.team_id}/${connection.user_id}/email/${messageId}/${identityKey}/${originalName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, fileBytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    if (uploadError.message?.includes("already exists")) {
      console.log(
        "[GMAIL-BACKSTOP] File already in storage:",
        storagePath
      );
    } else {
      console.error("[GMAIL-BACKSTOP] Storage upload failed:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
  }

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
      file_size: fileBytes.length,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      console.log(
        "[GMAIL-BACKSTOP] Duplicate email candidate:",
        messageId,
        candidate.kind
      );
      return null;
    }
    console.error("[GMAIL-BACKSTOP] Files insert error:", insertError);
    throw new Error(`Files insert failed: ${insertError.message}`);
  }

  console.log("[GMAIL-BACKSTOP] File record created:", fileRecord.id);

  // Trigger extract-invoice
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
        "[GMAIL-BACKSTOP] extract-invoice trigger failed:",
        extractResp.status,
        errorText
      );
    } else {
      console.log(
        "[GMAIL-BACKSTOP] extract-invoice triggered for file:",
        fileRecord.id
      );
    }
  } catch (triggerError) {
    console.error(
      "[GMAIL-BACKSTOP] Failed to trigger extract-invoice:",
      triggerError
    );
  }

  return { fileId: fileRecord.id };
}

/**
 * Process a single Gmail message through the scoring and extraction pipeline.
 */
async function processMessage(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  gmailMessageId: string,
  connection: EmailConnection
): Promise<{ processed: boolean; score: number; fileIds: string[] }> {
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
    `[GMAIL-BACKSTOP] Message ${gmailMessageId}: label=${detection.label}, confidence=${detection.confidence}, subject="${subject.substring(0, 60)}", candidates=${candidates.length}`
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
        "[GMAIL-BACKSTOP] Failed to process candidate:",
        candidate.kind,
        attError
      );
    }
  }

  return { processed: fileIds.length > 0, score: detection.confidence, fileIds };
}

/**
 * Process a single email connection: fetch history, score messages, create files.
 */
async function processConnection(
  supabase: ReturnType<typeof createClient>,
  connection: EmailConnection
): Promise<{
  email: string;
  messagesFound: number;
  processed: number;
  filesCreated: number;
  error?: string;
}> {
  const result = {
    email: connection.email_address,
    messagesFound: 0,
    processed: 0,
    filesCreated: 0,
    error: undefined as string | undefined,
  };

  try {
    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, connection);

    if (!connection.last_history_id) {
      // No history_id yet - fetch current Gmail profile to bootstrap it
      console.log(
        "[GMAIL-BACKSTOP] No last_history_id for connection:",
        connection.email_address,
        "-- bootstrapping from Gmail profile"
      );
      try {
        const profileResp = await fetch(
          `${GMAIL_API_BASE}/profile`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (profileResp.ok) {
          const profile = await profileResp.json();
          const historyId = profile.historyId;
          console.log("[GMAIL-BACKSTOP] Bootstrapped historyId:", historyId);
          await supabase
            .from("email_connections")
            .update({
              last_history_id: historyId,
              last_sync_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", connection.id);
          result.error = "bootstrapped_history_id";
        } else {
          console.error("[GMAIL-BACKSTOP] Gmail profile fetch failed:", profileResp.status);
          result.error = "profile_fetch_failed";
        }
      } catch (err) {
        console.error("[GMAIL-BACKSTOP] Failed to bootstrap history_id:", err);
        result.error = "bootstrap_failed";
      }
      return result;
    }

    // Fetch history
    const historyResponse = await fetchGmailHistory(
      accessToken,
      connection.last_history_id
    );

    // Collect unique new message IDs
    const newMessageIds = new Set<string>();
    if (historyResponse.history) {
      for (const historyRecord of historyResponse.history) {
        if (historyRecord.messagesAdded) {
          for (const added of historyRecord.messagesAdded) {
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

    result.messagesFound = newMessageIds.size;
    console.log(
      `[GMAIL-BACKSTOP] ${connection.email_address}: ${newMessageIds.size} new messages`
    );

    // Process each message
    for (const msgId of newMessageIds) {
      try {
        const msgResult = await processMessage(
          supabase,
          accessToken,
          msgId,
          connection
        );

        if (msgResult.processed) {
          result.processed++;
          result.filesCreated += msgResult.fileIds.length;
        }
      } catch (msgError) {
        console.error(
          `[GMAIL-BACKSTOP] Failed to process message ${msgId}:`,
          msgError
        );
      }
    }

    // Update connection
    await supabase
      .from("email_connections")
      .update({
        last_history_id: historyResponse.historyId,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
  } catch (connError) {
    const errorMsg =
      connError instanceof Error ? connError.message : String(connError);
    console.error(
      `[GMAIL-BACKSTOP] Error processing connection ${connection.email_address}:`,
      errorMsg
    );
    result.error = errorMsg;
  }

  return result;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log("=".repeat(60));
  console.log("[GMAIL-BACKSTOP] Backstop sync started");
  console.log("[GMAIL-BACKSTOP] Timestamp:", new Date().toISOString());

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
      console.error(
        "[GMAIL-BACKSTOP] Missing required environment variables"
      );
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify authorization -- this is called by pg_cron with service role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find active connections that haven't synced recently
    const staleThreshold = new Date(
      Date.now() - STALE_SYNC_THRESHOLD_MINUTES * 60 * 1000
    ).toISOString();

    const { data: staleConnections, error: queryError } = await supabase
      .from("email_connections")
      .select("*")
      .eq("status", "active")
      .or(
        `last_sync_at.is.null,last_sync_at.lt.${staleThreshold}`
      )
      .limit(MAX_CONNECTIONS_PER_RUN);

    if (queryError) {
      console.error(
        "[GMAIL-BACKSTOP] Query error:",
        queryError.message
      );
      return new Response(
        JSON.stringify({ error: queryError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!staleConnections || staleConnections.length === 0) {
      console.log(
        "[GMAIL-BACKSTOP] No stale connections found. All connections are up to date."
      );
      return new Response(
        JSON.stringify({
          processed: 0,
          message: "No stale connections",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[GMAIL-BACKSTOP] Found ${staleConnections.length} stale connections to process`
    );

    // Process each stale connection
    const results: Array<{
      email: string;
      messagesFound: number;
      processed: number;
      filesCreated: number;
      error?: string;
    }> = [];

    for (const connection of staleConnections) {
      const connResult = await processConnection(supabase, connection);
      results.push(connResult);
    }

    // Summary
    const totalMessages = results.reduce((s, r) => s + r.messagesFound, 0);
    const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
    const totalFiles = results.reduce((s, r) => s + r.filesCreated, 0);
    const errors = results.filter((r) => r.error);

    console.log(
      `[GMAIL-BACKSTOP] Complete. Connections: ${results.length}, Messages: ${totalMessages}, Processed: ${totalProcessed}, Files: ${totalFiles}, Errors: ${errors.length}`
    );
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({
        connections_processed: results.length,
        total_messages_found: totalMessages,
        total_processed: totalProcessed,
        total_files_created: totalFiles,
        errors: errors.length,
        details: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "[GMAIL-BACKSTOP] Unexpected error:",
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : ""
    );
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
