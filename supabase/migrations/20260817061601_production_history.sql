create table if not exists public.location_filter_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  amenity_keys jsonb not null default '[]'::jsonb,
  result_count integer not null default 0,
  result_location_ids jsonb not null default '[]'::jsonb,
  latitude double precision,
  longitude double precision,
  radius_meters integer not null default 15000,
  created_at timestamptz not null default now()
);
alter table public.location_filter_events enable row level security;
create index if not exists idx_location_filter_events_created_at on public.location_filter_events(created_at);
create index if not exists idx_location_filter_events_user on public.location_filter_events(user_id);
create index if not exists idx_location_filter_events_amenities on public.location_filter_events using gin(amenity_keys);

drop policy if exists "location_filter_events_insert_authenticated" on public.location_filter_events;
create policy "location_filter_events_insert_authenticated" on public.location_filter_events for insert to authenticated with check (user_id = auth.uid() or user_id is null);

drop policy if exists "location_filter_events_select_own" on public.location_filter_events;
create policy "location_filter_events_select_own" on public.location_filter_events for select to authenticated using (user_id = auth.uid());

create or replace function public.record_location_filter_event(
  p_amenity_keys jsonb default '[]'::jsonb,
  p_result_count integer default 0,
  p_result_location_ids jsonb default '[]'::jsonb,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_meters integer default 15000,
  p_session_id text default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  insert into public.location_filter_events(user_id,session_id,amenity_keys,result_count,result_location_ids,latitude,longitude,radius_meters)
  values(auth.uid(),p_session_id,coalesce(p_amenity_keys,'[]'::jsonb),greatest(0,coalesce(p_result_count,0)),coalesce(p_result_location_ids,'[]'::jsonb),p_latitude,p_longitude,greatest(1,least(coalesce(p_radius_meters,15000),50000)))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.record_location_filter_event(jsonb,integer,jsonb,double precision,double precision,integer,text) from public;
grant execute on function public.record_location_filter_event(jsonb,integer,jsonb,double precision,double precision,integer,text) to authenticated;
