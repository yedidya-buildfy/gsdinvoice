// Supabase Edge Function for initiating Gmail OAuth flow
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers for cross-origin requests
const ALLOWED_ORIGINS = ["https://bill-sync.com", "https://www.bill-sync.com", "http://localhost:5173"];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

interface GmailAuthRequest {
  team_id: string;
  redirect_origin?: string;
}

interface OAuthState {
  team_id: string;
  user_id: string;
  ts: number;
  redirect_origin?: string;
}

function isAllowedOrigin(origin?: string | null): origin is string {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  const pairs = normalized.match(/.{1,2}/g);
  if (!pairs) {
    throw new Error("State signing key is invalid");
  }
  return new Uint8Array(pairs.map((pair) => parseInt(pair, 16)));
}

async function importStateSigningKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(hexKey);
  if (keyBytes.length !== 32) {
    throw new Error(`State signing key must be 32 bytes, got ${keyBytes.length}`);
  }

  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function encodeSignedState(state: OAuthState, secretHex: string): Promise<string> {
  const payload = JSON.stringify(state);
  const payloadEncoded = base64UrlEncode(new TextEncoder().encode(payload));
  const key = await importStateSigningKey(secretHex);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadEncoded)
  );

  return `${payloadEncoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Validate required environment variables
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleRedirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    const tokenEncryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");

    if (!googleClientId || !googleRedirectUri || !tokenEncryptionKey) {
      console.error("[GMAIL-AUTH] Missing Google OAuth configuration");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Gmail integration is not configured",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify JWT authentication
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[GMAIL-AUTH] Missing Supabase env vars");
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

    // Authenticate user via their JWT
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[GMAIL-AUTH] Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[GMAIL-AUTH] Authenticated user:", user.id);

    // Parse request body
    const body: GmailAuthRequest = await req.json();
    const { team_id, redirect_origin } = body;

    if (!team_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: team_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate UUID format for team_id
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(team_id)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid team_id format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (redirect_origin && !isAllowedOrigin(redirect_origin)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid redirect origin" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role client for admin check (bypasses RLS)
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      console.error("[GMAIL-AUTH] Missing SUPABASE_SERVICE_ROLE_KEY");
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is a team admin (owner or admin role)
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .is("removed_at", null)
      .single();

    if (memberError || !membership) {
      console.error(
        "[GMAIL-AUTH] Team membership check failed:",
        memberError?.message
      );
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
      console.error(
        "[GMAIL-AUTH] Insufficient role:",
        membership.role,
        "for user:",
        user.id
      );
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Only team owners and admins can connect email accounts",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      "[GMAIL-AUTH] User role verified:",
      membership.role,
      "for team:",
      team_id
    );

    // Build a signed OAuth state parameter to prevent tampering.
    const state = await encodeSignedState(
      {
        team_id,
        user_id: user.id,
        ts: Date.now(),
        redirect_origin: redirect_origin || undefined,
      },
      tokenEncryptionKey
    );

    // Build Google OAuth URL
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: googleRedirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    console.log(
      "[GMAIL-AUTH] OAuth URL generated for team:",
      team_id,
      "user:",
      user.id
    );

    return new Response(
      JSON.stringify({ success: true, url: authUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[GMAIL-AUTH] Unexpected error:", err);
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
