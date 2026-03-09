// Supabase Edge Function for sending team invitation emails using Resend
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from 'npm:resend@2.0.0'

// CORS headers for cross-origin requests
const ALLOWED_ORIGINS = ["https://bill-sync.com", "https://www.bill-sync.com", "http://localhost:5173"];

function getCorsHeaders(req?: Request) {
  const origin = req?.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface InviteEmailRequest {
  invitation_id: string
}

interface InvitationEmailData {
  teamName: string
  inviterName: string
  role: string
  inviteUrl: string
}

interface InvitationRecord {
  id: string
  team_id: string
  email: string
  role: string
  token: string
  status: string
  expires_at: string
  team: { name: string } | null
}

function isAllowedOrigin(origin?: string | null): origin is string {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

function getRoleDisplayName(role: string): string {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'member':
      return 'Member'
    case 'viewer':
      return 'Viewer'
    default:
      return role.charAt(0).toUpperCase() + role.slice(1)
  }
}

function generateEmailHtml({
  teamName,
  inviterName,
  role,
  inviteUrl,
}: InvitationEmailData): string {
  const roleDisplay = getRoleDisplayName(role)

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Business Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                You're Invited!
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Hi there,
              </p>
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                <strong style="color: #111827;">${inviterName}</strong> has invited you to join
                <strong style="color: #111827;">${teamName}</strong> as a <strong style="color: #6366f1;">${roleDisplay}</strong>.
              </p>
              <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                Click the button below to accept the invitation and join the business.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${inviteUrl}"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 8px 0 0; word-break: break-all;">
                <a href="${inviteUrl}" style="color: #6366f1; font-size: 14px;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.5;">
                This invitation will expire in 7 days.<br>
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>

        <!-- Brand Footer -->
        <table role="presentation" style="max-width: 560px; margin: 20px auto 0;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Sent by BillSync
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

function generateEmailText({
  teamName,
  inviterName,
  role,
  inviteUrl,
}: InvitationEmailData): string {
  const roleDisplay = getRoleDisplayName(role)

  return `You're Invited to Join ${teamName}!

Hi there,

${inviterName} has invited you to join ${teamName} as a ${roleDisplay}.

Click the link below to accept the invitation and join the business:
${inviteUrl}

This invitation will expire in 7 days.
If you didn't expect this invitation, you can safely ignore this email.

---
Sent by BillSync
`
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email service not configured'
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse and validate request body
    const body: InviteEmailRequest = await req.json()
    const { invitation_id } = body

    if (!invitation_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required field: invitation_id'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: invitationData, error: invitationError } = await adminClient
      .from('team_invitations')
      .select(`
        id,
        team_id,
        email,
        role,
        token,
        status,
        expires_at,
        team:teams (
          name
        )
      `)
      .eq('id', invitation_id)
      .single()

    const invitation = invitationData as InvitationRecord | null

    if (invitationError || !invitation) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invitation not found'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('team_members')
      .select('role')
      .eq('team_id', invitation.team_id)
      .eq('user_id', user.id)
      .is('removed_at', null)
      .single()

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'You are not a member of this team'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Only team owners and admins can send invitation emails'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (invitation.status !== 'pending') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Only pending invitations can be emailed'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invitation has expired'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(invitation.email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invitation has an invalid email address'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Initialize Resend client
    const resend = new Resend(resendApiKey)

    // Get the from address from environment or use Resend's sandbox address
    // Note: For production, you'll need to verify your domain with Resend
    // The sandbox address only allows sending to your own verified email
    const envFromAddress = Deno.env.get('EMAIL_FROM_ADDRESS')

    // Default to Resend's test/sandbox address which works without domain verification
    const DEFAULT_FROM = 'BillSync <onboarding@resend.dev>'

    // Use environment value only if it's set and not empty, otherwise use default
    const fromAddress = envFromAddress && envFromAddress.trim() !== ''
      ? envFromAddress.trim()
      : DEFAULT_FROM

    // Log for debugging (will be visible in Supabase logs)
    console.log(`EMAIL_FROM_ADDRESS env value: "${envFromAddress || '(not set)'}"`)   
    console.log(`Using from address: "${fromAddress}"`)

    // Validate the from address format before sending
    const fromEmailRegex = /^[^<]+<[^\s@]+@[^\s@]+\.[^\s@]+>$|^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!fromEmailRegex.test(fromAddress)) {
      console.error(`Invalid from address format: "${fromAddress}"`)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid from address configuration. Using: "${fromAddress}". Expected format: "Name <email@example.com>" or "email@example.com"`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const inviterName =
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
      user.email ||
      'A team member'
    const appUrl = isAllowedOrigin(req.headers.get('Origin'))
      ? req.headers.get('Origin')!
      : (Deno.env.get('APP_URL') || ALLOWED_ORIGINS[0])
    const inviteUrl = `${appUrl}/invite/${invitation.token}`
    const teamName = invitation.team?.name || 'your team'
    const role = invitation.role

    console.log(`Sending business invite email to ${invitation.email} for business ${teamName}`)

    // Send the email
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [invitation.email],
      subject: `You've been invited to join ${teamName}`,
      html: generateEmailHtml({ teamName, inviterName, role, inviteUrl }),
      text: generateEmailText({ teamName, inviterName, role, inviteUrl }),
    })

    if (error) {
      console.error('Resend error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Failed to send email'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Email sent successfully:', data?.id)

    return new Response(
      JSON.stringify({
        success: true,
        messageId: data?.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
