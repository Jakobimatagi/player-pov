-- Local demo only. Studio shows this team after `supabase db reset`.
-- Password is local: coach@demo.local / password1234
-- Do not reuse this password on a hosted project.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'coach@demo.local',
  extensions.crypt('password1234', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Coach Kim"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
);

insert into auth.identities (
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'email', 'coach@demo.local',
    'email_verified', true
  ),
  'email',
  '00000000-0000-4000-8000-000000000001',
  now(),
  now(),
  now()
);

insert into public.teams (id, name, school, season, hash_rule, season_ends_on, created_by)
values (
  '00000000-0000-4000-8000-0000000000a1',
  'Demo Knights',
  'Demo High',
  '2026',
  'NFHS',
  '2026-11-30',
  '00000000-0000-4000-8000-000000000001'
);

insert into public.profiles (user_id, display_name)
values ('00000000-0000-4000-8000-000000000001', 'Coach Kim');

insert into public.memberships (team_id, user_id, role)
values (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-000000000001',
  'head_coach'
);
