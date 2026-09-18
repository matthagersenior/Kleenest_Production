create table if not exists public.partner_program_memberships (
  id uuid primary key default gen_random_uuid(),
  partner_program_id uuid not null references public.partner_programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','revoked')),
  source text not null default 'business_program',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(partner_program_id,user_id)
);

create index if not exists idx_partner_program_memberships_user on public.partner_program_memberships(user_id,status);
create index if not exists idx_partner_program_memberships_program on public.partner_program_memberships(partner_program_id,status);

create table if not exists public.preferred_location_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  partner_program_id uuid not null references public.partner_programs(id) on delete restrict,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  unique(user_id,location_id,partner_program_id)
);

create index if not exists idx_preferred_location_activations_location on public.preferred_location_activations(location_id,activated_at desc);
create index if not exists idx_preferred_location_activations_user on public.preferred_location_activations(user_id,activated_at desc);
create index if not exists idx_preferred_location_activations_program on public.preferred_location_activations(partner_program_id,activated_at desc);

create or replace function public.can_activate_preferred_location(p_location_id uuid)
returns table (
  eligible boolean,
  partner_program_id uuid,
  program_name text,
  partner_business_id uuid,
  reason text
)
language sql
security definer
set search_path = public
as $$
  with eligible_user as (
    select p.id
    from public.profiles p
    where p.id = auth.uid()
      and p.subscription_tier in ('premium','fleet','enterprise')
  ),
  matches as (
    select pp.id, pp.name, pp.business_id, pp.preferred_access
    from eligible_user eu
    join public.partner_program_memberships ppm on ppm.user_id = eu.id and ppm.status = 'active'
    join public.partner_programs pp on pp.id = ppm.partner_program_id
    join public.partner_agreements pa on pa.partner_program_id = pp.id and pa.status = 'active'
    join public.locations l on l.id = p_location_id
    where pp.enabled = true
      and pp.preferred_access = true
      and (ppm.expires_at is null or ppm.expires_at > now())
      and (pa.partner_business_id = l.business_id or pp.business_id = l.business_id)
  )
  select exists(select 1 from matches),
         (select id from matches limit 1),
         (select name from matches limit 1),
         (select business_id from matches limit 1),
         case when exists(select 1 from matches) then 'eligible' else 'no_active_preferred_partner_program' end;
$$;

create or replace function public.activate_preferred_location(p_location_id uuid, p_partner_program_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  a public.preferred_location_activations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select * into m from public.can_activate_preferred_location(p_location_id) limit 1;
  if coalesce(m.eligible,false) = false then
    raise exception 'preferred location access is not available for this location';
  end if;
  if p_partner_program_id is not null and m.partner_program_id <> p_partner_program_id then
    raise exception 'invalid partner program for this location';
  end if;
  insert into public.preferred_location_activations(user_id,location_id,partner_program_id)
  values(auth.uid(),p_location_id,coalesce(p_partner_program_id,m.partner_program_id))
  on conflict(user_id,location_id,partner_program_id)
  do update set deactivated_at=null;
  return jsonb_build_object('ok',true,'location_id',p_location_id,'partner_program_id',coalesce(p_partner_program_id,m.partner_program_id),'program_name',m.program_name);
end;
$$;

create or replace function public.deactivate_preferred_location(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.preferred_location_activations
     set deactivated_at=now()
   where user_id=auth.uid() and location_id=p_location_id and deactivated_at is null;
  return jsonb_build_object('ok',true,'location_id',p_location_id);
end;
$$;

create or replace function public.record_preferred_location_use(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.preferred_location_activations
     set last_used_at=now(), use_count=use_count+1
   where user_id=auth.uid() and location_id=p_location_id and deactivated_at is null;
  return jsonb_build_object('ok',true,'location_id',p_location_id);
end;
$$;

revoke all on function public.can_activate_preferred_location(uuid) from public, anon;
grant execute on function public.can_activate_preferred_location(uuid) to authenticated;
revoke all on function public.activate_preferred_location(uuid,uuid) from public, anon;
grant execute on function public.activate_preferred_location(uuid,uuid) to authenticated;
revoke all on function public.deactivate_preferred_location(uuid) from public, anon;
grant execute on function public.deactivate_preferred_location(uuid) to authenticated;
revoke all on function public.record_preferred_location_use(uuid) from public, anon;
grant execute on function public.record_preferred_location_use(uuid) to authenticated;

alter table public.partner_program_memberships enable row level security;
alter table public.preferred_location_activations enable row level security;

create policy "users read own partner program memberships" on public.partner_program_memberships
for select to authenticated using (user_id=auth.uid());

create policy "users read own preferred activations" on public.preferred_location_activations
for select to authenticated using (user_id=auth.uid());

create policy "business owners read preferred activations for their locations" on public.preferred_location_activations
for select to authenticated using (
  exists (
    select 1 from public.locations l
    join public.business_members bm on bm.business_id=l.business_id
    where l.id=preferred_location_activations.location_id and bm.user_id=auth.uid()
  )
);
