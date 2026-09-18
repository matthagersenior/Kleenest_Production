-- Kleenest Platform external beta onboarding.
-- Invite-only partner membership with service-role-only authority and partner-scoped wrappers.

create table if not exists public.platform_partner_members(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'developer' check(role in ('owner','admin','developer')),
  created_at timestamptz not null default now(),
  unique(partner_id,user_id)
);
create index if not exists platform_partner_members_user_idx
  on public.platform_partner_members(user_id,created_at desc);

create table if not exists public.platform_partner_invites(
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  email text not null,
  role text not null default 'developer' check(role in ('owner','admin','developer')),
  token_prefix text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(length(trim(email)) between 3 and 320)
);
create index if not exists platform_partner_invites_partner_email_idx
  on public.platform_partner_invites(partner_id,lower(email),created_at desc);
create index if not exists platform_partner_invites_due_idx
  on public.platform_partner_invites(expires_at)
  where claimed_at is null and revoked_at is null;

alter table public.platform_partner_members enable row level security;
alter table public.platform_partner_invites enable row level security;

revoke all on table public.platform_partner_members from public,anon,authenticated;
revoke all on table public.platform_partner_invites from public,anon,authenticated;
grant select,insert,update,delete on table public.platform_partner_members to service_role;
grant select,insert,update,delete on table public.platform_partner_invites to service_role;

drop policy if exists platform_partner_members_client_deny on public.platform_partner_members;
create policy platform_partner_members_client_deny on public.platform_partner_members
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_partner_invites_client_deny on public.platform_partner_invites;
create policy platform_partner_invites_client_deny on public.platform_partner_invites
  for all to anon,authenticated using(false) with check(false);

create or replace function public.platform_partner_member_role(
  p_user_id uuid,
  p_partner_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select m.role
  from public.platform_partner_members m
  join public.platform_partners p on p.id=m.partner_id
  where m.user_id=p_user_id
    and m.partner_id=p_partner_id
    and p.status='active'
  limit 1
$$;
revoke all on function public.platform_partner_member_role(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_partner_member_role(uuid,uuid) to service_role;

create or replace function public.create_platform_partner_invite(
  p_actor_user_id uuid,
  p_partner_id uuid,
  p_email text,
  p_role text default 'developer',
  p_platform_owner boolean default false,
  p_expires_at timestamptz default now()+interval '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor_role text;
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_role text:=lower(trim(coalesce(p_role,'developer')));
  v_raw text;
  v_prefix text;
  v_id uuid;
begin
  if v_email='' or position('@' in v_email)<2 then raise exception 'A valid invite email is required'; end if;
  if v_role not in ('owner','admin','developer') then raise exception 'Invalid partner role'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '30 days' then raise exception 'Invite expiration is invalid'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id and p.status='active') then
    raise exception 'Active partner not found';
  end if;

  if not coalesce(p_platform_owner,false) then
    v_actor_role:=public.platform_partner_member_role(p_actor_user_id,p_partner_id);
    if v_actor_role not in ('owner','admin') then raise exception 'Partner invite permission denied'; end if;
    if v_actor_role='admin' and v_role='owner' then raise exception 'Administrators cannot invite owners'; end if;
  end if;

  update public.platform_partner_invites
  set revoked_at=now()
  where partner_id=p_partner_id
    and lower(email)=v_email
    and claimed_at is null
    and revoked_at is null;

  v_raw:='kln_inv_'||encode(extensions.gen_random_bytes(24),'hex');
  v_prefix:=left(v_raw,16);

  insert into public.platform_partner_invites(
    partner_id,email,role,token_prefix,token_hash,expires_at,created_by
  )
  values(
    p_partner_id,v_email,v_role,v_prefix,
    encode(extensions.digest(v_raw,'sha256'),'hex'),
    p_expires_at,p_actor_user_id
  )
  returning id into v_id;

  return jsonb_build_object(
    'invite_id',v_id,
    'invite_token',v_raw,
    'token_prefix',v_prefix,
    'partner_id',p_partner_id,
    'email',v_email,
    'role',v_role,
    'expires_at',p_expires_at
  );
end;
$$;
revoke all on function public.create_platform_partner_invite(uuid,uuid,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.create_platform_partner_invite(uuid,uuid,text,text,boolean,timestamptz) to service_role;

create or replace function public.claim_platform_partner_invite(
  p_raw_token text,
  p_user_id uuid,
  p_user_email text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invite public.platform_partner_invites;
  v_email text:=lower(trim(coalesce(p_user_email,'')));
begin
  if p_user_id is null or v_email='' then raise exception 'Authenticated user email is required'; end if;

  select * into v_invite
  from public.platform_partner_invites i
  where i.token_hash=encode(extensions.digest(coalesce(p_raw_token,''),'sha256'),'hex')
  for update;

  if v_invite.id is null then raise exception 'Invite is invalid'; end if;
  if v_invite.revoked_at is not null then raise exception 'Invite is revoked'; end if;
  if v_invite.claimed_at is not null then raise exception 'Invite has already been claimed'; end if;
  if v_invite.expires_at<=now() then raise exception 'Invite has expired'; end if;
  if lower(v_invite.email)<>v_email then raise exception 'Invite email does not match authenticated user'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id and lower(coalesce(u.email,''))=v_email) then
    raise exception 'Authenticated user does not match invite';
  end if;

  insert into public.platform_partner_members(partner_id,user_id,role)
  values(v_invite.partner_id,p_user_id,v_invite.role)
  on conflict(partner_id,user_id) do update
  set role=case
    when public.platform_partner_members.role='owner' then 'owner'
    else excluded.role
  end;

  update public.platform_partner_invites
  set claimed_by=p_user_id,claimed_at=now()
  where id=v_invite.id;

  return jsonb_build_object(
    'partner_id',v_invite.partner_id,
    'role',v_invite.role,
    'claimed_at',now()
  );
end;
$$;
revoke all on function public.claim_platform_partner_invite(text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_platform_partner_invite(text,uuid,text) to service_role;

create or replace function public.platform_user_partner_memberships(p_user_id uuid)
returns table(
  partner_id uuid,
  slug text,
  name text,
  status text,
  plan text,
  quota_per_minute integer,
  quota_per_month bigint,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select p.id,p.slug,p.name,p.status,p.plan,p.quota_per_minute,p.quota_per_month,m.role,m.created_at
  from public.platform_partner_members m
  join public.platform_partners p on p.id=m.partner_id
  where m.user_id=p_user_id
  order by m.created_at,p.name
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
declare v_role text;
begin
  v_role:=public.platform_partner_member_role(p_user_id,p_partner_id);
  if v_role is null then raise exception 'Partner membership required'; end if;
  return public.platform_partner_summary(p_partner_id) || jsonb_build_object('membership_role',v_role);
end;
$$;
revoke all on function public.platform_member_partner_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_member_partner_summary(uuid,uuid) to service_role;

create or replace function public.issue_platform_member_api_key(
  p_user_id uuid,
  p_partner_id uuid,
  p_label text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_active integer;
begin
  v_role:=public.platform_partner_member_role(p_user_id,p_partner_id);
  if v_role is null then raise exception 'Partner membership required'; end if;

  select count(*) into v_active
  from public.platform_api_keys k
  where k.partner_id=p_partner_id
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at>now());

  if v_active>=5 then raise exception 'Partner API key limit reached'; end if;
  if p_expires_at is not null and (p_expires_at<=now() or p_expires_at>now()+interval '2 years') then
    raise exception 'API key expiration is invalid';
  end if;

  return public.issue_platform_api_key(
    p_partner_id,
    coalesce(nullif(trim(p_label),''),'Integration key'),
    array['recommendations:read']::text[],
    p_expires_at
  );
end;
$$;
revoke all on function public.issue_platform_member_api_key(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_platform_member_api_key(uuid,uuid,text,timestamptz) to service_role;

create or replace function public.revoke_platform_member_api_key(
  p_user_id uuid,
  p_partner_id uuid,
  p_api_key_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.platform_partner_member_role(p_user_id,p_partner_id) is null then
    raise exception 'Partner membership required';
  end if;
  if not exists(select 1 from public.platform_api_keys k where k.id=p_api_key_id and k.partner_id=p_partner_id) then
    raise exception 'API key not found for partner';
  end if;
  return public.revoke_platform_api_key(p_api_key_id);
end;
$$;
revoke all on function public.revoke_platform_member_api_key(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_platform_member_api_key(uuid,uuid,uuid) to service_role;

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
declare v_active integer;
begin
  if public.platform_partner_member_role(p_user_id,p_partner_id) is null then
    raise exception 'Partner membership required';
  end if;

  select count(*) into v_active
  from public.platform_webhook_endpoints e
  where e.partner_id=p_partner_id and e.active;
  if v_active>=10 then raise exception 'Partner webhook endpoint limit reached'; end if;

  return public.create_platform_webhook_endpoint(
    p_partner_id,p_url,p_label,p_event_types
  );
end;
$$;
revoke all on function public.create_platform_member_webhook_endpoint(uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.create_platform_member_webhook_endpoint(uuid,uuid,text,text,text[]) to service_role;

create or replace function public.disable_platform_member_webhook_endpoint(
  p_user_id uuid,
  p_partner_id uuid,
  p_endpoint_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.platform_partner_member_role(p_user_id,p_partner_id) is null then
    raise exception 'Partner membership required';
  end if;
  if not exists(
    select 1 from public.platform_webhook_endpoints e
    where e.id=p_endpoint_id and e.partner_id=p_partner_id
  ) then raise exception 'Webhook endpoint not found for partner'; end if;
  return public.disable_platform_webhook_endpoint(p_endpoint_id);
end;
$$;
revoke all on function public.disable_platform_member_webhook_endpoint(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.disable_platform_member_webhook_endpoint(uuid,uuid,uuid) to service_role;

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
  if public.platform_partner_member_role(p_user_id,p_partner_id) is null then
    raise exception 'Partner membership required';
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
