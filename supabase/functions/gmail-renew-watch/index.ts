// Supabase Edge Function for renewing Gmail Pub/Sub watch subscriptions.
// Runs daily at 3 AM via pg_cron. Gmail watch subscriptions expire after 7 days,
// so this ensures continuous push notifications for all active connections.
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
    "[GMAIL-RENEW-WATCH] Refreshing access token for:",
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
      "[GMAIL-RENEW-WATCH] Token refresh failed:",
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
          "[GMAIL-RENEW-WATCH] Refresh token revoked, marking connection as revoked"
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

  console.log("[GMAIL-RENEW-WATCH] Token refreshed successfully");
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
// GMAIL WATCH API
// ============================================================================

interface WatchResponse {
  historyId: string;
  expiration: string; // Unix timestamp in milliseconds as string
}

/**
 * Call the Gmail watch API to register/renew a Pub/Sub push subscription.
 * This tells Gmail to send push notifications to our topic for new emails.
 */
async function renewWatch(
  accessToken: string,
  topicName: string
): Promise<WatchResponse> {
  const resp = await fetch(`${GMAIL_API_BASE}/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Gmail watch API error: ${resp.status} - ${errorText}`);
  }

  return await resp.json();
}

/**
 * Process a single connection: refresh token if needed, renew watch subscription.
 */
async function processConnection(
  supabase: ReturnType<typeof createClient>,
  connection: EmailConnection,
  topicName: string
): Promise<{
  email: string;
  success: boolean;
  historyId?: string;
  expiration?: string;
  error?: string;
}> {
  const result = {
    email: connection.email_address,
    success: false,
    historyId: undefined as string | undefined,
    expiration: undefined as string | undefined,
    error: undefined as string | undefined,
  };

  try {
    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, connection);

    // Renew the watch subscription
    console.log(
      "[GMAIL-RENEW-WATCH] Renewing watch for:",
      connection.email_address
    );

    const watchResponse = await renewWatch(accessToken, topicName);

    console.log(
      "[GMAIL-RENEW-WATCH] Watch renewed for:",
      connection.email_address,
      "historyId:",
      watchResponse.historyId,
      "expiration:",
      watchResponse.expiration
    );

    // Update the connection with the new historyId from the watch response.
    // The watch response provides the current historyId, which we should use
    // as the baseline for future delta syncs if we don't already have one.
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Only update last_history_id if:
    // 1. We don't have one yet, OR
    // 2. The watch response returns a newer one
    if (!connection.last_history_id) {
      updatePayload.last_history_id = watchResponse.historyId;
      console.log(
        "[GMAIL-RENEW-WATCH] Setting initial history_id:",
        watchResponse.historyId
      );
    } else {
      // Compare as numbers -- Gmail historyIds are numeric strings
      const currentId = parseInt(connection.last_history_id, 10);
      const newId = parseInt(watchResponse.historyId, 10);
      if (!isNaN(currentId) && !isNaN(newId) && newId > currentId) {
        updatePayload.last_history_id = watchResponse.historyId;
        console.log(
          "[GMAIL-RENEW-WATCH] Advancing history_id from",
          connection.last_history_id,
          "to",
          watchResponse.historyId
        );
      }
    }

    // Store watch expiration in sync_state for monitoring
    const currentSyncState =
      (connection as unknown as { sync_state: Record<string, unknown> })
        .sync_state || {};
    updatePayload.sync_state = {
      ...currentSyncState,
      watch_expiration: watchResponse.expiration,
      watch_renewed_at: new Date().toISOString(),
    };

    await supabase
      .from("email_connections")
      .update(updatePayload)
      .eq("id", connection.id);

    result.success = true;
    result.historyId = watchResponse.historyId;
    result.expiration = new Date(
      parseInt(watchResponse.expiration, 10)
    ).toISOString();
  } catch (connError) {
    const errorMsg =
      connError instanceof Error ? connError.message : String(connError);
    console.error(
      `[GMAIL-RENEW-WATCH] Error for ${connection.email_address}:`,
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
  console.log("[GMAIL-RENEW-WATCH] Watch renewal started");
  console.log("[GMAIL-RENEW-WATCH] Timestamp:", new Date().toISOString());

  try {
    // Validate environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const tokenEncryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const gmailPubsubTopic = Deno.env.get("GMAIL_PUBSUB_TOPIC");

    if (
      !supabaseUrl ||
      !supabaseServiceKey ||
      !tokenEncryptionKey ||
      !googleClientId ||
      !googleClientSecret ||
      !gmailPubsubTopic
    ) {
      const missing = [
        !supabaseUrl && "SUPABASE_URL",
        !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
        !tokenEncryptionKey && "TOKEN_ENCRYPTION_KEY",
        !googleClientId && "GOOGLE_CLIENT_ID",
        !googleClientSecret && "GOOGLE_CLIENT_SECRET",
        !gmailPubsubTopic && "GMAIL_PUBSUB_TOPIC",
      ].filter(Boolean);
      console.error(
        "[GMAIL-RENEW-WATCH] Missing environment variables:",
        missing
      );
      return new Response(
        JSON.stringify({
          error: "Server configuration error",
          missing,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify authorization -- called by pg_cron with service role
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

    // Fetch all active email connections
    const { data: connections, error: queryError } = await supabase
      .from("email_connections")
      .select("*")
      .eq("status", "active");

    if (queryError) {
      console.error(
        "[GMAIL-RENEW-WATCH] Query error:",
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

    if (!connections || connections.length === 0) {
      console.log(
        "[GMAIL-RENEW-WATCH] No active connections found. Nothing to renew."
      );
      return new Response(
        JSON.stringify({
          renewed: 0,
          message: "No active connections",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[GMAIL-RENEW-WATCH] Found ${connections.length} active connections to renew`
    );

    // Process each connection
    const results: Array<{
      email: string;
      success: boolean;
      historyId?: string;
      expiration?: string;
      error?: string;
    }> = [];

    for (const connection of connections) {
      const connResult = await processConnection(
        supabase,
        connection,
        gmailPubsubTopic
      );
      results.push(connResult);

      // Small delay between connections to avoid rate limiting
      if (connections.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(
      `[GMAIL-RENEW-WATCH] Complete. Total: ${results.length}, Succeeded: ${succeeded}, Failed: ${failed}`
    );
    console.log("=".repeat(60));

    return new Response(
      JSON.stringify({
        total: results.length,
        renewed: succeeded,
        failed,
        details: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(
      "[GMAIL-RENEW-WATCH] Unexpected error:",
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
