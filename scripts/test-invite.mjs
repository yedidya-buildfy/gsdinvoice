#!/usr/bin/env node
/**
 * Test script to send a team invitation
 * Usage: node scripts/test-invite.mjs
 *
 * Note: This requires being authenticated. You'll need to provide
 * a valid session token or run from a context where you're already logged in.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gkagkwpqozymjvehzucy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYWdrd3Bxb3p5bWp2ZWh6dWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTIxMzgsImV4cCI6MjA4NTA4ODEzOH0.cuPalVWuZDXjn2B3SayU021tdC9f1OMNvDzQou76Nrw'

const INVITE_EMAIL = 'yedidyadan33@gmail.com'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Generate a secure random token for invitations
 */
function generateToken() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function main() {
  console.log('=== Team Invitation Test ===\n')

  // Step 1: Check current auth state
  console.log('1. Checking authentication...')
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.log('   Not authenticated. Please sign in first.')
    console.log('   You can sign in using the app at http://localhost:5173')
    console.log('\n   Alternatively, provide credentials:')

    // Try to sign in with email/password if provided via env
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD

    if (email && password) {
      console.log(`   Attempting to sign in as ${email}...`)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        console.error('   Sign in failed:', signInError.message)
        process.exit(1)
      }

      console.log('   Signed in successfully!')
    } else {
      console.log('\n   Set TEST_EMAIL and TEST_PASSWORD environment variables to auto-sign-in')
      process.exit(1)
    }
  }

  // Re-fetch user after potential sign-in
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  console.log(`   Authenticated as: ${currentUser.email} (${currentUser.id})\n`)

  // Step 2: Check for existing teams
  console.log('2. Fetching teams...')
  const { data: memberships, error: teamError } = await supabase
    .from('team_members')
    .select(`
      role,
      team:teams (
        id,
        name,
        slug,
        owner_id
      )
    `)
    .eq('user_id', currentUser.id)
    .is('removed_at', null)

  if (teamError) {
    console.error('   Failed to fetch teams:', teamError.message)
    process.exit(1)
  }

  if (!memberships || memberships.length === 0) {
    console.log('   No teams found. Creating a personal team...')

    const teamName = `${currentUser.user_metadata?.full_name || 'My'}'s Team`
    const slug = `team-${currentUser.id.slice(0, 8)}-${Date.now()}`

    const { data: newTeam, error: createError } = await supabase
      .from('teams')
      .insert({
        name: teamName,
        slug,
        owner_id: currentUser.id,
      })
      .select()
      .single()

    if (createError) {
      console.error('   Failed to create team:', createError.message)
      process.exit(1)
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: newTeam.id,
        user_id: currentUser.id,
        role: 'owner',
      })

    if (memberError) {
      console.error('   Failed to add member:', memberError.message)
      process.exit(1)
    }

    console.log(`   Created team: ${newTeam.name} (${newTeam.id})`)
    memberships.push({ role: 'owner', team: newTeam })
  }

  const teams = memberships.filter(m => m.team).map(m => m.team)
  console.log(`   Found ${teams.length} team(s):`)
  teams.forEach((team, i) => {
    console.log(`   ${i + 1}. ${team.name} (${team.id})`)
  })

  // Use the first team
  const targetTeam = teams[0]
  console.log(`\n   Using team: ${targetTeam.name}\n`)

  // Step 3: Check for existing invitation
  console.log('3. Checking for existing invitation...')
  const { data: existingInvite } = await supabase
    .from('team_invitations')
    .select('id, status, created_at')
    .eq('team_id', targetTeam.id)
    .eq('email', INVITE_EMAIL)
    .eq('status', 'pending')
    .single()

  if (existingInvite) {
    console.log(`   Pending invitation already exists (created: ${existingInvite.created_at})`)
    console.log('   Skipping creation to avoid duplicates.')
    console.log('\n=== Test Complete (invitation already exists) ===')
    process.exit(0)
  }

  console.log('   No existing pending invitation found.\n')

  // Step 4: Create the invitation
  console.log('4. Creating invitation...')
  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiration

  const { data: invitation, error: inviteError } = await supabase
    .from('team_invitations')
    .insert({
      team_id: targetTeam.id,
      email: INVITE_EMAIL,
      role: 'member',
      token,
      invited_by: currentUser.id,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (inviteError) {
    console.error('   Failed to create invitation:', inviteError.message)
    process.exit(1)
  }

  console.log('   Invitation created successfully!')
  console.log(`   - ID: ${invitation.id}`)
  console.log(`   - Email: ${invitation.email}`)
  console.log(`   - Role: ${invitation.role}`)
  console.log(`   - Expires: ${invitation.expires_at}`)

  // Step 5: Log audit entry
  console.log('\n5. Creating audit log...')
  const { error: auditError } = await supabase.from('team_audit_logs').insert({
    team_id: targetTeam.id,
    action: 'member.invited',
    metadata: { email: INVITE_EMAIL, role: 'member', invitation_id: invitation.id },
  })

  if (auditError) {
    console.warn('   Warning: Failed to create audit log:', auditError.message)
  } else {
    console.log('   Audit log created.')
  }

  // Step 6: Send invitation email via edge function
  console.log('\n6. Sending invitation email via edge function...')
  const inviteUrl = `http://localhost:5173/invite/${token}`

  try {
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-team-invite', {
      body: {
        email: INVITE_EMAIL,
        teamName: targetTeam.name,
        inviterName: currentUser.user_metadata?.full_name || currentUser.email || 'A team member',
        role: 'member',
        inviteUrl,
      },
    })

    if (emailError) {
      console.warn('   Warning: Email function returned error:', emailError.message)
      console.log('   The invitation was created but the email may not have been sent.')
    } else {
      console.log('   Email sent successfully!')
      if (emailResult) {
        console.log('   Response:', JSON.stringify(emailResult, null, 2))
      }
    }
  } catch (err) {
    console.warn('   Warning: Failed to invoke email function:', err.message)
    console.log('   The invitation was created but the email may not have been sent.')
  }

  // Summary
  console.log('\n=== Test Complete ===')
  console.log(`\nInvitation URL: ${inviteUrl}`)
  console.log(`\nThe recipient (${INVITE_EMAIL}) should:`)
  console.log('1. Receive an email with the invitation link')
  console.log('2. Click the link to accept the invitation')
  console.log('3. Sign in or create an account if needed')
}

main().catch(console.error)
