create table if not exists public.partner_program_locations (
 id uuid primary key default gen_random_uuid(),
 partner_program_id uuid not null references public.partner_programs(id) on delete cascade,
 location_id uuid not null references public.locations(id) on delete cascade,
 status text not null default 'active' check(status in ('active','paused','revoked')),
 benefit_type text not null default 'preferred_location',
 created_at timestamptz not null default now(),
 unique(partner_program_id,location_id)
);
create index if not exists idx_partner_program_locations_program on public.partner_program_locations(partner_program_id,status);
create index if not exists idx_partner_program_locations_location on public.partner_program_locations(location_id,status);
alter table public.partner_program_locations enable row level security;
create policy "program owners read scoped locations" on public.partner_program_locations for select to authenticated using(exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id where pp.id=partner_program_locations.partner_program_id and bm.user_id=auth.uid()));

create or replace function public.can_activate_preferred_location(p_location_id uuid)
returns table(eligible boolean,partner_program_id uuid,program_name text,partner_business_id uuid,reason text)
language sql security definer set search_path=public as $$
 with matches as (
  select pp.id,pp.name,pp.business_id
  from public.profiles p
  join public.partner_program_memberships ppm on ppm.user_id=p.id and ppm.status='active' and (ppm.expires_at is null or ppm.expires_at>now())
  join public.partner_programs pp on pp.id=ppm.partner_program_id and pp.enabled=true and pp.preferred_access=true
  join public.partner_agreements pa on pa.partner_program_id=pp.id and pa.status='active'
  join public.partner_program_locations ppl on ppl.partner_program_id=pp.id and ppl.location_id=p_location_id and ppl.status='active' and ppl.benefit_type='preferred_location'
  where p.id=auth.uid() and p.subscription_tier in ('premium','fleet','enterprise')
 )
 select exists(select 1 from matches),(select id from matches limit 1),(select name from matches limit 1),(select business_id from matches limit 1),case when exists(select 1 from matches) then 'eligible' else 'no_scoped_preferred_program' end;
$$;

create or replace function public.business_add_program_location(p_partner_program_id uuid,p_location_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id join public.locations l on l.business_id=pp.business_id where pp.id=p_partner_program_id and l.id=p_location_id and bm.user_id=auth.uid()) then raise exception 'not authorized for program/location'; end if;
 insert into public.partner_program_locations(partner_program_id,location_id,status,benefit_type) values(p_partner_program_id,p_location_id,'active','preferred_location') on conflict(partner_program_id,location_id) do update set status='active' returning id into v_id;
 return v_id;
end;$$;

create or replace function public.business_remove_program_location(p_partner_program_id uuid,p_location_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.partner_programs pp join public.business_members bm on bm.business_id=pp.business_id join public.locations l on l.business_id=pp.business_id where pp.id=p_partner_program_id and l.id=p_location_id and bm.user_id=auth.uid()) then raise exception 'not authorized for program/location'; end if;
 update public.partner_program_locations set status='revoked' where partner_program_id=p_partner_program_id and location_id=p_location_id;
 return true;
end;$$;

grant execute on function public.can_activate_preferred_location(uuid) to authenticated;
grant execute on function public.business_add_program_location(uuid,uuid) to authenticated;
grant execute on function public.business_remove_program_location(uuid,uuid) to authenticated;
