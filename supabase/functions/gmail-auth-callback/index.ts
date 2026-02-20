// Supabase Edge Function for handling Gmail OAuth callback
// This is a GET endpoint (browser redirect from Google) - no CORS needed
import { createClient } from "npm:@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// ============================================================================
// ENCRYPTION UTILITIES
// ============================================================================

/**
 * Import an AES-GCM key from a hex-encoded string (32 bytes = 256 bits)
 */
async function importEncryptionKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(
    hexKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  if (keyBytes.length !== 32) {
    throw new Error(
      `Encryption key must be 32 bytes (64 hex chars), got ${keyBytes.length} bytes`
    );
  }
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
}

/**
 * Encrypt a string using AES-GCM.
 * Returns base64(iv + ciphertext) where iv is 12 bytes.
 */
async function encryptToken(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  // Concatenate iv + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert to base64
  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

// ============================================================================
// STATE DECODING
// ============================================================================

interface OAuthState {
  team_id: string;
  user_id: string;
  ts: number;
  redirect_origin?: string;
}

function decodeState(stateParam: string): OAuthState {
  const decoded = atob(stateParam);
  const parsed = JSON.parse(decoded);

  if (!parsed.team_id || !parsed.user_id || !parsed.ts) {
    throw new Error("Invalid state: missing required fields");
  }

  return parsed as OAuthState;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  const defaultAppUrl = Deno.env.get("APP_URL") || "http://localhost:5173";

  // Determine the app URL - will be updated from state if available
  let appUrl = defaultAppUrl;

  // Helper: redirect to app with error
  function redirectWithError(message: string): Response {
    const encoded = encodeURIComponent(message);
    console.error("[GMAIL-CALLBACK] Redirecting with error:", message);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}/settings?tab=email&error=${encoded}`,
      },
    });
  }

  try {
    // Parse query parameters from the redirect URL
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    // Handle Google error response (user denied access, etc.)
    if (errorParam) {
      const errorDesc =
        url.searchParams.get("error_description") || errorParam;
      console.error("[GMAIL-CALLBACK] Google returned error:", errorParam, errorDesc);
      return redirectWithError(errorDesc);
    }

    // Validate required parameters
    if (!code) {
      return redirectWithError("Missing authorization code from Google");
    }

    if (!stateParam) {
      return redirectWithError("Missing state parameter");
    }

    // Decode and validate state
    let state: OAuthState;
    try {
      state = decodeState(stateParam);
    } catch (stateError) {
      console.error(
        "[GMAIL-CALLBACK] Failed to decode state:",
        stateError
      );
      return redirectWithError("Invalid OAuth state parameter");
    }

    const { team_id, user_id, ts } = state;

    // Use redirect_origin from state if provided (supports local dev)
    if (state.redirect_origin) {
      appUrl = state.redirect_origin;
    }
    console.log("[GMAIL-CALLBACK] OAuth callback for team:", team_id, "user:", user_id);

    // Validate state timestamp (reject if older than 10 minutes)
    const stateAgeMs = Date.now() - ts;
    const maxStateAgeMs = 10 * 60 * 1000; // 10 minutes
    if (stateAgeMs > maxStateAgeMs) {
      return redirectWithError(
        "OAuth session expired. Please try connecting again."
      );
    }

    // Validate environment variables
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRedirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    const tokenEncryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (
      !googleClientId ||
      !googleClientSecret ||
      !googleRedirectUri ||
      !tokenEncryptionKey ||
      !supabaseUrl ||
      !supabaseServiceKey
    ) {
      const missing = [
        !googleClientId && "GOOGLE_CLIENT_ID",
        !googleClientSecret && "GOOGLE_CLIENT_SECRET",
        !googleRedirectUri && "GOOGLE_REDIRECT_URI",
        !tokenEncryptionKey && "TOKEN_ENCRYPTION_KEY",
        !supabaseUrl && "SUPABASE_URL",
        !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
      ].filter(Boolean);
      console.error(
        "[GMAIL-CALLBACK] Missing environment variables:",
        missing
      );
      return redirectWithError("Server configuration error");
    }

    // ========================================================================
    // STEP 1: Exchange authorization code for tokens
    // ========================================================================
    console.log("[GMAIL-CALLBACK] Exchanging code for tokens...");

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error(
        "[GMAIL-CALLBACK] Token exchange failed:",
        tokenResponse.status,
        tokenError
      );

      let errorMessage = "Failed to exchange authorization code";
      try {
        const parsed = JSON.parse(tokenError);
        if (parsed.error_description) {
          errorMessage = parsed.error_description;
        } else if (parsed.error) {
          errorMessage = parsed.error;
        }
      } catch {
        // Use default error message
      }

      return redirectWithError(errorMessage);
    }

    const tokenData = await tokenResponse.json();
    const {
      access_token,
      refresh_token,
      expires_in,
      scope: grantedScopes,
    } = tokenData;

    if (!access_token) {
      console.error(
        "[GMAIL-CALLBACK] No access_token in token response:",
        Object.keys(tokenData)
      );
      return redirectWithError("Google did not return an access token");
    }

    if (!refresh_token) {
      console.error(
        "[GMAIL-CALLBACK] No refresh_token in token response. This can happen if the user has already granted access. Prompting consent again may be needed."
      );
      return redirectWithError(
        "Google did not return a refresh token. Please revoke app access in your Google Account settings and try again."
      );
    }

    console.log(
      "[GMAIL-CALLBACK] Tokens received. expires_in:",
      expires_in,
      "scopes:",
      grantedScopes
    );

    // ========================================================================
    // STEP 2: Get user email from Google
    // ========================================================================
    console.log("[GMAIL-CALLBACK] Fetching user info...");

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userInfoResponse.ok) {
      const userInfoError = await userInfoResponse.text();
      console.error(
        "[GMAIL-CALLBACK] User info fetch failed:",
        userInfoResponse.status,
        userInfoError
      );
      return redirectWithError("Failed to retrieve Gmail account information");
    }

    const userInfo = await userInfoResponse.json();
    const emailAddress = userInfo.email;

    if (!emailAddress) {
      console.error(
        "[GMAIL-CALLBACK] No email in user info response:",
        Object.keys(userInfo)
      );
      return redirectWithError(
        "Could not determine email address from Google account"
      );
    }

    console.log("[GMAIL-CALLBACK] Gmail address:", emailAddress);

    // ========================================================================
    // STEP 3: Encrypt tokens
    // ========================================================================
    console.log("[GMAIL-CALLBACK] Encrypting tokens...");

    let encryptionKey: CryptoKey;
    try {
      encryptionKey = await importEncryptionKey(tokenEncryptionKey);
    } catch (keyError) {
      console.error(
        "[GMAIL-CALLBACK] Failed to import encryption key:",
        keyError
      );
      return redirectWithError("Server encryption configuration error");
    }

    const encryptedAccessToken = await encryptToken(access_token, encryptionKey);
    const encryptedRefreshToken = await encryptToken(
      refresh_token,
      encryptionKey
    );

    // ========================================================================
    // STEP 4: Upsert email connection into database
    // ========================================================================
    console.log("[GMAIL-CALLBACK] Saving email connection...");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate token expiration timestamp
    const tokenExpiresAt = new Date(
      Date.now() + (expires_in || 3600) * 1000
    ).toISOString();

    // Parse granted scopes into array
    const scopesArray = grantedScopes
      ? grantedScopes.split(" ").filter((s: string) => s.length > 0)
      : [];

    const { error: upsertError } = await supabase
      .from("email_connections")
      .upsert(
        {
          team_id,
          user_id,
          provider: "gmail",
          email_address: emailAddress,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: tokenExpiresAt,
          scopes: scopesArray,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "team_id,email_address",
        }
      );

    if (upsertError) {
      console.error(
        "[GMAIL-CALLBACK] Database upsert failed:",
        upsertError.message,
        upsertError.code,
        upsertError.details
      );
      return redirectWithError("Failed to save email connection");
    }

    console.log(
      "[GMAIL-CALLBACK] Email connection saved successfully for:",
      emailAddress,
      "team:",
      team_id
    );

    // ========================================================================
    // STEP 5: Redirect to settings page with success
    // ========================================================================
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}/settings?tab=email&connected=true`,
      },
    });
  } catch (err) {
    console.error(
      "[GMAIL-CALLBACK] Unexpected error:",
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : ""
    );
    return redirectWithError("An unexpected error occurred");
  }
});
