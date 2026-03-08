// Supabase Edge Function for Gmail receipt/invoice sync
// Handles historical email scanning (mode: 'start') and continued pagination (mode: 'continue')
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { detectFinancialEmail } from "../_shared/email-ingestion/detectFinancialEmail.ts";
import { discoverDocumentCandidates } from "../_shared/email-ingestion/discoverCandidates.ts";
import {
  base64UrlDecodeToBytes,
  extractHtmlBody,
  getHeader,
  sanitizeFilename,
} from "../_shared/email-ingestion/message.ts";
import { normalizeSenderRules } from "../_shared/email-ingestion/senderRules.ts";
import type {
  EmailCandidate,
  NormalizedSenderRule,
} from "../_shared/email-ingestion/types.ts";

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
const GEMINI_CLASSIFY_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_CLASSIFY_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CLASSIFY_MODEL}:generateContent`;

// Processing limits per invocation
const MAX_EMAILS_PER_PAGE = 50;
const TIMEOUT_GUARD_MS = 45_000; // 45 seconds - leave buffer for Edge Function limit
const STALE_SYNC_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
  sender_rules: unknown;
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
          status: "reauthorization_required",
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
 * Count total messages matching a query by paginating through IDs only.
 * Uses maxResults=500 (Gmail max) for fast counting — no message content fetched.
 */
async function countMessages(
  accessToken: string,
  query: string
): Promise<number> {
  let total = 0;
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ q: query, maxResults: "500" });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `${GMAIL_API_BASE}/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      console.warn("[GMAIL] Count failed, falling back to estimate");
      return 0; // Return 0 to signal fallback to estimate
    }

    const data = await response.json();
    total += (data.messages?.length ?? 0);
    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log("[GMAIL] Exact message count:", total);
  return total;
}

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
// SHARED CANDIDATE DOWNLOAD HELPERS
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

async function downloadCandidateContent(
  accessToken: string,
  message: GmailMessage,
  candidate: EmailCandidate,
): Promise<DownloadedContent | null> {
  if (candidate.kind === "attachment") {
    const attachData = await getAttachment(accessToken, message.id, candidate.attachmentId);
    return {
      blob: base64UrlDecodeToBytes(attachData.data),
      filename: candidate.filename,
      mimeType: candidate.mimeType,
    };
  }

  if (candidate.kind === "html_body") {
    const htmlBody = extractHtmlBody(message.payload);
    if (!htmlBody) return null;

    return {
      blob: new TextEncoder().encode(htmlBody),
      filename: candidate.filename,
      mimeType: candidate.mimeType,
    };
  }

  return await downloadRemoteContent(candidate.url);
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
  candidate: EmailCandidate,
  content: DownloadedContent,
  detection: { label: "yes" | "maybe" | "no"; confidence: number; reason: string }
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const attachmentId = candidate.kind === "attachment" ? candidate.attachmentId : null;
  const contentKind = candidate.kind;
  const sourceUrl = candidate.kind === "download_link" ? candidate.url : null;

  // Check for duplicate candidate identity.
  let duplicateQuery = supabase
    .from("files")
    .select("id")
    .eq("email_message_id", messageId)
    .eq("team_id", teamId)
    .eq("email_content_kind", contentKind);

  duplicateQuery = attachmentId
    ? duplicateQuery.eq("email_attachment_id", attachmentId)
    : duplicateQuery.is("email_attachment_id", null);

  duplicateQuery = sourceUrl
    ? duplicateQuery.eq("email_source_url", sourceUrl)
    : duplicateQuery.is("email_source_url", null);

  const { data: existingFile } = await duplicateQuery
    .limit(1)
    .maybeSingle();

  if (existingFile) {
    console.log(
      "[FILE] Duplicate candidate detected, skipping:",
      messageId,
      contentKind,
      attachmentId || sourceUrl || "inline"
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

  const fileType = mimeTypeToFileType(content.mimeType, content.filename);

  // Upload to Supabase Storage
  const candidateKey = attachmentId || contentKind;
  const storagePath = `receipts/${teamId}/${messageId}/${candidateKey}/${sanitizeFilename(content.filename)}`;
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
      email_attachment_id: attachmentId,
      email_content_kind: contentKind,
      email_source_url: sourceUrl,
      email_detection_label: detection.label,
      email_detection_confidence: detection.confidence,
      email_detection_reason: detection.reason,
      email_discovery_metadata: JSON.parse(JSON.stringify(candidate)),
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

  // Trigger extract-invoice edge function (fire and forget).
  if (supabaseUrl && supabaseAnonKey) {
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
  syncState: SyncState,
  accessToken?: string
): Promise<void> {
  // Fetch current Gmail profile historyId for incremental sync
  let historyId: string | undefined;
  if (accessToken) {
    try {
      const profileResp = await fetch(
        `${GMAIL_API_BASE}/profile`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (profileResp.ok) {
        const profile = await profileResp.json();
        historyId = profile.historyId;
        console.log("[SYNC-STATE] Got Gmail historyId:", historyId);
      }
    } catch (err) {
      console.error("[SYNC-STATE] Failed to fetch Gmail profile:", err);
    }
  }

  const updateData: Record<string, unknown> = {
    sync_state: {
      ...syncState,
      status: "completed",
      current_page_token: null,
    },
    status: "active",
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (historyId) {
    updateData.last_history_id = historyId;
  }

  const { error } = await supabase
    .from("email_connections")
    .update(updateData)
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
  senderRules: NormalizedSenderRule[],
  startTime: number
): Promise<{ receiptsFound: number; emailsProcessed: number }> {
  let receiptsFound = 0;
  let emailsProcessed = 0;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

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
      // Fetch full message
      const message = await getMessage(accessToken, ref.id);
      emailsProcessed++;

      const candidates = discoverDocumentCandidates(message);
      if (candidates.length === 0) {
        continue;
      }

      const detection = await detectFinancialEmail(
        geminiApiKey,
        message,
        candidates,
        senderRules,
        GEMINI_CLASSIFY_URL,
      );

      console.log("[PROCESS] Email:", ref.id, {
        subject: (getHeader(message, "Subject") || "").substring(0, 60),
        detection,
        candidateCount: candidates.length,
      });

      if (detection.label === "no") {
        continue;
      }

      for (const candidate of candidates) {
        const content = await downloadCandidateContent(accessToken, message, candidate);
        if (!content) {
          console.warn("[PROCESS] Candidate produced no content:", ref.id, candidate.identityKey);
          continue;
        }

        const fileId = await createFileFromEmail(
          supabase,
          connection.team_id,
          connection.user_id,
          message.id,
          candidate,
          content,
          detection,
        );

        if (fileId) {
          receiptsFound++;
          console.log("[PROCESS] Candidate saved, file_id:", fileId, candidate.identityKey);
        }
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
  let query = "-in:chats -label:spam -label:trash";

  if (dateFrom) {
    // Gmail date format: YYYY/MM/DD
    const formatted = dateFrom.replace(/-/g, "/");
    query += ` after:${formatted}`;
  }

  if (dateTo) {
    const formatted = dateTo.replace(/-/g, "/");
    query += ` before:${formatted}`;
  }

  return query.trim();
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

    if (mode !== "start" && mode !== "continue" && mode !== "resume") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid mode. Use 'start', 'continue', or 'resume'.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ==================================================================
    // MODE: RESUME - Resume a failed sync from where it left off
    // ==================================================================
    if (mode === "resume") {
      const connectionId = body.connection_id;
      if (!connectionId) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing connection_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: conn, error: connError } = await supabase
        .from("email_connections")
        .select("*")
        .eq("id", connectionId)
        .single();

      if (connError || !conn) {
        return new Response(
          JSON.stringify({ success: false, error: "Connection not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const syncState = conn.sync_state as SyncState | null;
      if (!syncState?.current_page_token) {
        return new Response(
          JSON.stringify({ success: false, error: "No pending pages to resume" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Re-count total emails if the stored estimate looks stale
      let totalEstimated = syncState.total_emails_estimated || 0;
      if (syncState.search_query && (totalEstimated < (syncState.emails_checked || 0))) {
        try {
          const typedConn = conn as unknown as EmailConnection;
          const accessToken = await getValidAccessToken(typedConn, supabase);
          const exactCount = await countMessages(accessToken, syncState.search_query);
          if (exactCount > 0) {
            totalEstimated = exactCount;
            console.log("[GMAIL-SYNC] Re-counted total on resume:", exactCount);
          }
        } catch (err) {
          console.warn("[GMAIL-SYNC] Failed to re-count on resume:", err);
        }
      }

      // Reset to syncing so the cron job picks it up
      await supabase
        .from("email_connections")
        .update({
          status: "syncing",
          sync_state: {
            ...syncState,
            status: "syncing",
            last_error: null,
            total_emails_estimated: totalEstimated,
            started_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);

      console.log("[GMAIL-SYNC] Resumed sync for connection:", connectionId,
        "from page token, emails_checked:", syncState.emails_checked);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Sync resumed",
          emails_checked: syncState.emails_checked,
          receipts_found: syncState.receipts_found,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

      // Count exact total first (fast — only fetches message IDs)
      const exactCount = await countMessages(accessToken, searchQuery);

      // Search for first page of messages to process
      const searchResult = await searchMessages(accessToken, searchQuery);

      // Use exact count, fall back to Gmail estimate
      initialSyncState.total_emails_estimated =
        exactCount || searchResult.resultSizeEstimate || 0;
      console.log(
        "[GMAIL-SYNC] Total emails:",
        initialSyncState.total_emails_estimated,
        exactCount ? "(exact)" : "(estimate)"
      );

      if (!searchResult.messages || searchResult.messages.length === 0) {
        // No matching emails found
        console.log("[GMAIL-SYNC] No matching emails found");
        await completeSyncState(supabase, connection_id, initialSyncState, accessToken);

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
      const senderRules = normalizeSenderRules(typedConnection.sender_rules);
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
        await completeSyncState(supabase, connection_id, updatedSyncState, accessToken);
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
            status: "failed",
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
        let tokenForProfile: string | undefined;
        try {
          tokenForProfile = await getValidAccessToken(connection, supabase);
        } catch { /* non-fatal */ }
        await completeSyncState(supabase, connection.id, syncState, tokenForProfile);
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
            status: "reauthorization_required",
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
        await completeSyncState(supabase, connection.id, syncState, accessToken);
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
      const senderRules = normalizeSenderRules(connection.sender_rules);
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
        await completeSyncState(supabase, connection.id, updatedSyncState, accessToken);
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
