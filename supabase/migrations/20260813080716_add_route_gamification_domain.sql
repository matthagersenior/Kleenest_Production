begin;
create table if not exists public.route_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null default 'My route',
 status text not null default 'draft' check (status in ('draft','active','completed','cancelled')),
 start_lat double precision,
 start_lng double precision,
 end_lat double precision,
 end_lng double precision,
 distance_miles numeric(10,2) not null default 0,
 estimated_minutes integer not null default 0,
 stops_count integer not null default 0,
 points_earned integer not null default 0,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.route_stops (
 id uuid primary key default gen_random_uuid(),
 route_id uuid not null references public.route_plans(id) on delete cascade,
 location_id uuid not null,
 stop_order integer not null,
 points_value integer not null default 10,
 checked_in_at timestamptz,
 created_at timestamptz not null default now(),
 unique(route_id,stop_order)
);
create table if not exists public.route_events (
 id uuid primary key default gen_random_uuid(),
 route_id uuid not null references public.route_plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check (event_type in ('started','stop_completed','route_completed','route_shared')),
 route_stop_id uuid references public.route_stops(id) on delete set null,
 points_awarded integer not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.route_plans enable row level security;
alter table public.route_stops enable row level security;
alter table public.route_events enable row level security;
drop policy if exists route_plans_owner on public.route_plans;
create policy route_plans_owner on public.route_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists route_stops_owner on public.route_stops;
create policy route_stops_owner on public.route_stops for all to authenticated using(exists(select 1 from public.route_plans r where r.id=route_id and r.user_id=auth.uid())) with check(exists(select 1 from public.route_plans r where r.id=route_id and r.user_id=auth.uid()));
drop policy if exists route_events_owner on public.route_events;
create policy route_events_owner on public.route_events for select to authenticated using(user_id=auth.uid());
create or replace function public.create_route_plan(p_name text, p_start_lat double precision, p_start_lng double precision, p_end_lat double precision, p_end_lng double precision, p_distance_miles numeric, p_estimated_minutes integer) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare rid uuid; begin if auth.uid() is null then raise exception 'authentication required'; end if; insert into public.route_plans(user_id,name,start_lat,start_lng,end_lat,end_lng,distance_miles,estimated_minutes) values(auth.uid(),coalesce(nullif(trim(p_name),''),'My route'),p_start_lat,p_start_lng,p_end_lat,p_end_lng,greatest(0,coalesce(p_distance_miles,0)),greatest(0,coalesce(p_estimated_minutes,0))) returning id into rid; insert into public.route_events(route_id,user_id,event_type,points_awarded) values(rid,auth.uid(),'started',0); return rid; end $$;
revoke execute on function public.create_route_plan(text,double precision,double precision,double precision,double precision,numeric,integer) from anon;
create or replace function public.complete_route(p_route_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare r public.route_plans; pts integer; begin if auth.uid() is null then raise exception 'authentication required'; end if; select * into r from public.route_plans where id=p_route_id and user_id=auth.uid() for update; if not found then raise exception 'route not found'; end if; if r.status='completed' then return jsonb_build_object('route_id',r.id,'points',r.points_earned,'already_completed',true); end if; pts:=greatest(10,least(250,round(coalesce(r.distance_miles,0)*10)::integer + coalesce(r.stops_count,0)*15)); update public.route_plans set status='completed',points_earned=pts,completed_at=now(),updated_at=now() where id=r.id; insert into public.route_events(route_id,user_id,event_type,points_awarded,metadata) values(r.id,auth.uid(),'route_completed',pts,jsonb_build_object('distance_miles',r.distance_miles,'stops_count',r.stops_count)); return jsonb_build_object('route_id',r.id,'points',pts,'already_completed',false); end $$;
revoke execute on function public.complete_route(uuid) from anon;
commit;
