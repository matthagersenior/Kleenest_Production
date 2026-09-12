-- Kleenest Platform external beta onboarding:
-- invite-only partner membership and membership-checked service wrappers.

create table if not exists public.platform_partner_members(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'developer' check(role in ('owner','admin','developer','viewer')),
  status text not null default 'active' check(status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, user_id)
);
create index if not exists platform_partner_members_user_idx
  on public.platform_partner_members(user_id,status,created_at desc);

create table if not exists public.platform_partner_invites(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  email text not null check(length(trim(email)) between 3 and 320),
  role text not null default 'developer' check(role in ('owner','admin','developer','viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(expires_at>created_at)
);
create index if not exists platform_partner_invites_partner_idx
  on public.platform_partner_invites(partner_id,created_at desc);
create index if not exists platform_partner_invites_email_idx
  on public.platform_partner_invites(lower(email),expires_at desc);

alter table public.platform_partner_members enable row level security;
alter table public.platform_partner_invites enable row level security;

drop policy if exists platform_partner_members_client_deny on public.platform_partner_members;
create policy platform_partner_members_client_deny on public.platform_partner_members
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_partner_invites_client_deny on public.platform_partner_invites;
create policy platform_partner_invites_client_deny on public.platform_partner_invites
  for all to anon,authenticated using(false) with check(false);

revoke all on table public.platform_partner_members from public,anon,authenticated;
revoke all on table public.platform_partner_invites from public,anon,authenticated;
grant select,insert,update,delete on table public.platform_partner_members to service_role;
grant select,insert,update,delete on table public.platform_partner_invites to service_role;

create or replace function public.create_platform_partner_invite(
  p_partner_id uuid,
  p_email text,
  p_role text default 'developer',
  p_created_by_user_id uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_role text:=lower(trim(coalesce(p_role,'developer')));
  v_raw text;
  v_id uuid;
  v_expires timestamptz:=coalesce(p_expires_at,now()+interval '7 days');
begin
  if position('@' in v_email)<2 or length(v_email)>320 then
    raise exception 'A valid invite email is required';
  end if;
  if v_role not in ('owner','admin','developer','viewer') then
    raise exception 'Invalid partner role';
  end if;
  if v_expires<=now() then
    raise exception 'Invite expiration must be in the future';
  end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id and p.status='active') then
    raise exception 'Active partner not found';
  end if;

  v_raw:='kln_inv_'||encode(extensions.gen_random_bytes(24),'hex');

  insert into public.platform_partner_invites(
    partner_id,email,role,token_hash,expires_at,created_by_user_id
  )
  values(
    p_partner_id,v_email,v_role,
    encode(extensions.digest(v_raw,'sha256'),'hex'),
    v_expires,p_created_by_user_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'invite_id',v_id,
    'invite_token',v_raw,
    'partner_id',p_partner_id,
    'email',v_email,
    'role',v_role,
    'expires_at',v_expires
  );
end;
$$;
revoke all on function public.create_platform_partner_invite(uuid,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.create_platform_partner_invite(uuid,text,text,uuid,timestamptz) to service_role;

create or replace function public.claim_platform_partner_invite(
  p_token text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invite public.platform_partner_invites;
  v_user_email text;
begin
  select lower(email) into v_user_email from auth.users where id=p_user_id;
  if nullif(v_user_email,'') is null then
    raise exception 'Authenticated user not found';
  end if;

  select * into v_invite
  from public.platform_partner_invites i
  where i.token_hash=encode(extensions.digest(trim(coalesce(p_token,'')),'sha256'),'hex')
  for update;

  if v_invite.id is null then raise exception 'Invite not found'; end if;
  if v_invite.accepted_at is not null then raise exception 'Invite already claimed'; end if;
  if v_invite.expires_at<=now() then raise exception 'Invite expired'; end if;
  if lower(v_invite.email)<>v_user_email then raise exception 'Invite email does not match authenticated user'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=v_invite.partner_id and p.status='active') then
    raise exception 'Partner is not active';
  end if;

  insert into public.platform_partner_members(partner_id,user_id,role,status)
  values(v_invite.partner_id,p_user_id,v_invite.role,'active')
  on conflict(partner_id,user_id) do update
  set role=excluded.role,status='active',updated_at=now();

  update public.platform_partner_invites
  set accepted_at=now(),accepted_by_user_id=p_user_id
  where id=v_invite.id;

  return jsonb_build_object(
    'partner_id',v_invite.partner_id,
    'role',v_invite.role,
    'email',v_invite.email
  );
end;
$$;
revoke all on function public.claim_platform_partner_invite(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_platform_partner_invite(text,uuid) to service_role;

create or replace function public.platform_user_partner_memberships(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'partner_id',p.id,
    'slug',p.slug,
    'name',p.name,
    'status',p.status,
    'plan',p.plan,
    'quota_per_minute',p.quota_per_minute,
    'quota_per_month',p.quota_per_month,
    'member_role',m.role,
    'member_status',m.status,
    'joined_at',m.created_at
  ) order by m.created_at desc),'[]'::jsonb)
  from public.platform_partner_members m
  join public.platform_partners p on p.id=m.partner_id
  where m.user_id=p_user_id and m.status='active'
$$;
revoke all on function public.platform_user_partner_memberships(uuid) from public,anon,authenticated;
grant execute on function public.platform_user_partner_memberships(uuid) to service_role;

create or replace function public.platform_member_partner_summary(
  p_user_id uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.platform_partner_members m
    where m.partner_id=p_partner_id and m.user_id=p_user_id and m.status='active'
  ) then
    raise exception 'Partner membership required';
  end if;
  return public.platform_partner_summary(p_partner_id);
end;
$$;
revoke all on function public.platform_member_partner_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_member_partner_summary(uuid,uuid) to service_role;

create or replace function public.issue_platform_member_api_key(
  p_user_id uuid,
  p_partner_id uuid,
  p_label text,
  p_scopes text[] default array['recommendations:read']::text[],
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.platform_partner_members m
    where m.partner_id=p_partner_id and m.user_id=p_user_id
      and m.status='active' and m.role in ('owner','admin','developer')
  ) then
    raise exception 'Partner developer membership required';
  end if;
  return public.issue_platform_api_key(p_partner_id,p_label,p_scopes,p_expires_at);
end;
$$;
revoke all on function public.issue_platform_member_api_key(uuid,uuid,text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.issue_platform_member_api_key(uuid,uuid,text,text[],timestamptz) to service_role;

create or replace function public.revoke_platform_member_api_key(
  p_user_id uuid,
  p_api_key_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_partner_id uuid;
begin
  select k.partner_id into v_partner_id from public.platform_api_keys k where k.id=p_api_key_id;
  if v_partner_id is null then return false; end if;
  if not exists(
    select 1 from public.platform_partner_members m
    where m.partner_id=v_partner_id and m.user_id=p_user_id
      and m.status='active' and m.role in ('owner','admin','developer')
  ) then
    raise exception 'Partner developer membership required';
  end if;
  return public.revoke_platform_api_key(p_api_key_id);
end;
$$;
revoke all on function public.revoke_platform_member_api_key(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_platform_member_api_key(uuid,uuid) to service_role;

create or replace function public.create_platform_member_webhook_endpoint(
  p_user_id uuid,
  p_partner_id uuid,
  p_url text,
  p_label text,
  p_event_types text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.platform_partner_members m
    where m.partner_id=p_partner_id and m.user_id=p_user_id
      and m.status='active' and m.role in ('owner','admin','developer')
  ) then
    raise exception 'Partner developer membership required';
  end if;
  return public.create_platform_webhook_endpoint(p_partner_id,p_url,p_label,p_event_types);
end;
$$;
revoke all on function public.create_platform_member_webhook_endpoint(uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.create_platform_member_webhook_endpoint(uuid,uuid,text,text,text[]) to service_role;

create or replace function public.disable_platform_member_webhook_endpoint(
  p_user_id uuid,
  p_endpoint_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_partner_id uuid;
begin
  select e.partner_id into v_partner_id from public.platform_webhook_endpoints e where e.id=p_endpoint_id;
  if v_partner_id is null then return false; end if;
  if not exists(
    select 1 from public.platform_partner_members m
    where m.partner_id=v_partner_id and m.user_id=p_user_id
      and m.status='active' and m.role in ('owner','admin','developer')
  ) then
    raise exception 'Partner developer membership required';
  end if;
  return public.disable_platform_webhook_endpoint(p_endpoint_id);
end;
$$;
revoke all on function public.disable_platform_member_webhook_endpoint(uuid,uuid) from public,anon,authenticated;
grant execute on function public.disable_platform_member_webhook_endpoint(uuid,uuid) to service_role;

create or replace function public.enqueue_platform_member_test_webhook(
  p_user_id uuid,
  p_partner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.platform_partner_members m
    where m.partner_id=p_partner_id and m.user_id=p_user_id
      and m.status='active' and m.role in ('owner','admin','developer')
  ) then
    raise exception 'Partner developer membership required';
  end if;
  return public.enqueue_platform_webhook_event(
    p_partner_id,
    'platform.test',
    jsonb_build_object('message','Kleenest Platform test webhook','sentAt',now())
  );
end;
$$;
revoke all on function public.enqueue_platform_member_test_webhook(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_platform_member_test_webhook(uuid,uuid) to service_role;
