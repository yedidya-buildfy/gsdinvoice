/**
 * Browser Console Test Script for Team Invitation
 *
 * Instructions:
 * 1. Open the app at http://localhost:5173
 * 2. Sign in with your account
 * 3. Open browser dev tools (F12 or Cmd+Option+I)
 * 4. Go to the Console tab
 * 5. Copy and paste this entire script and press Enter
 */

(async function testTeamInvitation() {
  const INVITE_EMAIL = 'yedidyadan33@gmail.com';

  console.log('=== Team Invitation Test ===\n');

  // Access the supabase client from the app
  // The app exposes it via window or we can import it
  let supabase;

  // Try to get supabase from the window or module
  if (window.__SUPABASE_CLIENT__) {
    supabase = window.__SUPABASE_CLIENT__;
  } else {
    // Dynamically import
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = createClient(
      'https://gkagkwpqozymjvehzucy.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrYWdrd3Bxb3p5bWp2ZWh6dWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTIxMzgsImV4cCI6MjA4NTA4ODEzOH0.cuPalVWuZDXjn2B3SayU021tdC9f1OMNvDzQou76Nrw'
    );
  }

  // Step 1: Check auth
  console.log('1. Checking authentication...');
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Not authenticated! Please sign in first.');
    return;
  }
  console.log(`   Authenticated as: ${user.email}`);

  // Step 2: Get teams
  console.log('\n2. Fetching teams...');
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
    .eq('user_id', user.id)
    .is('removed_at', null);

  if (teamError) {
    console.error('Failed to fetch teams:', teamError.message);
    return;
  }

  const teams = memberships.filter(m => m.team).map(m => m.team);
  console.log(`   Found ${teams.length} team(s)`);

  if (teams.length === 0) {
    console.error('No teams found. Please create a team first.');
    return;
  }

  const targetTeam = teams[0];
  console.log(`   Using team: ${targetTeam.name} (${targetTeam.id})`);

  // Step 3: Check existing invitation
  console.log('\n3. Checking for existing invitation...');
  const { data: existingInvite } = await supabase
    .from('team_invitations')
    .select('id, status, created_at, token')
    .eq('team_id', targetTeam.id)
    .eq('email', INVITE_EMAIL)
    .eq('status', 'pending')
    .single();

  if (existingInvite) {
    console.log(`   Pending invitation already exists!`);
    console.log(`   Created: ${existingInvite.created_at}`);
    const inviteUrl = `${window.location.origin}/invite/${existingInvite.token}`;
    console.log(`   Invite URL: ${inviteUrl}`);
    console.log('\n   Skipping creation. Use the URL above to test.');
    return;
  }

  // Step 4: Create invitation
  console.log('\n4. Creating invitation...');

  function generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invitation, error: inviteError } = await supabase
    .from('team_invitations')
    .insert({
      team_id: targetTeam.id,
      email: INVITE_EMAIL,
      role: 'member',
      token,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (inviteError) {
    console.error('Failed to create invitation:', inviteError.message);
    return;
  }

  console.log('   Invitation created!');
  console.log(`   ID: ${invitation.id}`);
  console.log(`   Email: ${invitation.email}`);
  console.log(`   Role: ${invitation.role}`);

  // Step 5: Audit log
  console.log('\n5. Creating audit log...');
  await supabase.from('team_audit_logs').insert({
    team_id: targetTeam.id,
    action: 'member.invited',
    metadata: { email: INVITE_EMAIL, role: 'member', invitation_id: invitation.id },
  });
  console.log('   Done.');

  // Step 6: Send email
  console.log('\n6. Sending invitation email...');
  const inviteUrl = `${window.location.origin}/invite/${token}`;

  try {
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-team-invite', {
      body: {
        email: INVITE_EMAIL,
        teamName: targetTeam.name,
        inviterName: user.user_metadata?.full_name || user.email || 'A team member',
        role: 'member',
        inviteUrl,
      },
    });

    if (emailError) {
      console.warn('   Email function error:', emailError);
    } else {
      console.log('   Email sent successfully!');
      console.log('   Response:', emailResult);
    }
  } catch (err) {
    console.warn('   Email function failed:', err.message);
  }

  // Summary
  console.log('\n=== TEST COMPLETE ===');
  console.log(`\nInvite URL: ${inviteUrl}`);
  console.log(`\nShare this URL with ${INVITE_EMAIL} to accept the invitation.`);
})();
