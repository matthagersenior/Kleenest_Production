create table if not exists public.fleet_premium_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id,user_id)
);

alter table public.fleet_premium_memberships enable row level security;

create policy fleet_premium_memberships_self_read on public.fleet_premium_memberships
for select to authenticated
using (user_id=auth.uid());

create policy fleet_premium_memberships_manager_read on public.fleet_premium_memberships
for select to authenticated
using (public.fleet_actor_is_manager(business_id) or public.is_platform_owner(auth.uid()));

create or replace function public.fleet_list_premium_members(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,
      'business_id',m.business_id,
      'user_id',m.user_id,
      'status',m.status,
      'granted_at',m.granted_at,
      'revoked_at',m.revoked_at,
      'display_name',p.display_name,
      'username',p.username,
      'metadata',m.metadata
    ) order by case when m.status='active' then 0 else 1 end,m.updated_at desc),'[]'::jsonb)
    from public.fleet_premium_memberships m
    left join public.profiles p on p.id=m.user_id
    where m.business_id=p_business_id
  );
end $$;

create or replace function public.fleet_grant_premium_member(p_business_id uuid,p_user_id uuid,p_metadata jsonb default '{}'::jsonb)
returns public.fleet_premium_memberships
language plpgsql
security definer
set search_path=''
as $$
declare r public.fleet_premium_memberships;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  if not public.business_fleet_authorized(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet access is not enabled for this business';
  end if;
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'Kleenest user not found';
  end if;
  insert into public.fleet_premium_memberships(business_id,user_id,status,granted_by,granted_at,revoked_at,metadata)
  values(p_business_id,p_user_id,'active',auth.uid(),now(),null,coalesce(p_metadata,'{}'::jsonb))
  on conflict(business_id,user_id) do update set
    status='active',granted_by=auth.uid(),granted_at=now(),revoked_at=null,
    metadata=coalesce(excluded.metadata,public.fleet_premium_memberships.metadata),updated_at=now()
  returning * into r;
  return r;
end $$;

create or replace function public.fleet_grant_premium_member_by_email(p_business_id uuid,p_email text,p_metadata jsonb default '{}'::jsonb)
returns public.fleet_premium_memberships
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  select id into uid from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if uid is null then raise exception 'No Kleenest account exists for that email'; end if;
  return public.fleet_grant_premium_member(p_business_id,uid,coalesce(p_metadata,'{}'::jsonb));
end $$;

create or replace function public.fleet_revoke_premium_member(p_business_id uuid,p_user_id uuid)
returns public.fleet_premium_memberships
language plpgsql
security definer
set search_path=''
as $$
declare r public.fleet_premium_memberships;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) and not public.is_platform_owner(auth.uid()) then
    raise exception 'Fleet manager access required';
  end if;
  update public.fleet_premium_memberships
  set status='revoked',revoked_at=now(),updated_at=now()
  where business_id=p_business_id and user_id=p_user_id and status<>'revoked'
  returning * into r;
  if r.id is null then raise exception 'Active Fleet Premium membership not found'; end if;
  return r;
end $$;

create or replace function public.has_kleenest_premium()
returns boolean
language sql
stable
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
  select case
    when auth.uid() is null then false
    else
      coalesce((select
        (raw_app_meta_data->>'premiumEntitlement')='active'
        or (raw_app_meta_data->>'premiumOwnership')='lifetime'
        or lower(coalesce(raw_app_meta_data->>'subscriptionLevel','')) in ('premium','fleet','enterprise','business')
        from auth.users where id=auth.uid()),false)
      or exists(
        select 1 from public.account_service_entitlements e
        where e.account_user_id=auth.uid()
          and e.service_tier in ('premium','family','fleet','business_fleet','enterprise','business_enterprise')
      )
      or public.family_has_premium_access(auth.uid())
      or exists(
        select 1 from public.fleet_premium_memberships m
        where m.user_id=auth.uid() and m.status='active'
      )
  end;
$$;

revoke all on function public.fleet_list_premium_members(uuid) from public,anon;
revoke all on function public.fleet_grant_premium_member(uuid,uuid,jsonb) from public,anon;
revoke all on function public.fleet_grant_premium_member_by_email(uuid,text,jsonb) from public,anon;
revoke all on function public.fleet_revoke_premium_member(uuid,uuid) from public,anon;
grant execute on function public.fleet_list_premium_members(uuid) to authenticated,service_role;
grant execute on function public.fleet_grant_premium_member(uuid,uuid,jsonb) to authenticated,service_role;
grant execute on function public.fleet_grant_premium_member_by_email(uuid,text,jsonb) to authenticated,service_role;
grant execute on function public.fleet_revoke_premium_member(uuid,uuid) to authenticated,service_role;
