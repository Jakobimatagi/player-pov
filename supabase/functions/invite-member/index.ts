import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1'

const CONSENT = "I confirm this player's parent/guardian or school has consented to this account"

type Body = {
  teamId?: string
  email?: string
  name?: string
  role?: 'head_coach' | 'coach' | 'player'
  position?: string | null
  consent?: boolean
  resend?: boolean
  inviteId?: string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const appUrl = Deno.env.get('APP_URL') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  const body = (await req.json()) as Body
  if (!body.resend && body.role === 'player' && body.consent !== true) {
    return Response.json({ error: 'Confirm consent to invite a player' }, { status: 400 })
  }
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  if (body.resend) {
    const { data: email, error: resendError } = await userClient.rpc('resend_invite', {
      p_invite: body.inviteId,
    })
    if (resendError) return Response.json({ error: resendError.message }, { status: 400 })
    const adminResend = createClient(url, service)
    const { error: mailError } = await adminResend.auth.admin.inviteUserByEmail(
      String(email ?? ''),
      {
        redirectTo: `${appUrl}/accept-invite`,
        data: { invite_id: body.inviteId },
      },
    )
    if (mailError) return Response.json({ error: mailError.message }, { status: 502 })
    return Response.json({ inviteId: body.inviteId })
  }
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || userData.user == null) {
    return Response.json({ error: 'Sign in required' }, { status: 401 })
  }
  const { data: inviteId, error: rpcError } = await userClient.rpc('create_player_invite', {
    p_team: body.teamId,
    p_email: body.email,
    p_name: body.name,
    p_role: body.role,
    p_position: body.position,
    p_consent: body.consent === true,
    p_statement: CONSENT,
  })
  if (rpcError) return Response.json({ error: rpcError.message }, { status: 400 })
  const admin = createClient(url, service)
  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(body.email ?? '', {
    redirectTo: `${appUrl}/accept-invite`,
    data: { invite_id: inviteId },
  })
  if (mailError) return Response.json({ error: mailError.message, inviteId }, { status: 502 })
  return Response.json({ inviteId })
})
