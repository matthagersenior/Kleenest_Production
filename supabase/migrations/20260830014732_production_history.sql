alter table public.review_amenity_feedback add column if not exists observed_quantity integer;
alter table public.location_amenity_observations add column if not exists observed_quantity integer;

do $$ begin
  alter table public.review_amenity_feedback add constraint review_amenity_feedback_quantity_check check (observed_quantity is null or observed_quantity between 0 and 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.location_amenity_observations add constraint location_amenity_observations_quantity_check check (observed_quantity is null or observed_quantity between 0 and 1000);
exception when duplicate_object then null; end $$;

create table if not exists public.location_occupancy_observations(
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_in_id uuid references public.check_ins(id) on delete set null,
  occupancy_count integer not null check (occupancy_count >= 0 and occupancy_count <= 10000),
  capacity_count integer check (capacity_count is null or (capacity_count > 0 and capacity_count <= 10000)),
  queue_count integer check (queue_count is null or (queue_count >= 0 and queue_count <= 10000)),
  wait_minutes numeric check (wait_minutes is null or (wait_minutes >= 0 and wait_minutes <= 1440)),
  confidence numeric not null default 0.75 check (confidence between 0 and 1),
  observation_method text not null default 'user',
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists location_occupancy_observations_location_time_idx on public.location_occupancy_observations(location_id,observed_at desc);
create index if not exists location_occupancy_observations_user_time_idx on public.location_occupancy_observations(user_id,observed_at desc);
alter table public.location_occupancy_observations enable row level security;
drop policy if exists location_occupancy_own_insert on public.location_occupancy_observations;
create policy location_occupancy_own_insert on public.location_occupancy_observations for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists location_occupancy_own_read on public.location_occupancy_observations;
create policy location_occupancy_own_read on public.location_occupancy_observations for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.location_occupancy_observations from anon;
grant select,insert on public.location_occupancy_observations to authenticated;

create or replace function public.record_review_amenity_inventory(p_review_id uuid,p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare v_location uuid; v_item jsonb; v_amenity uuid; v_sentiment text; v_qty integer; v_count integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select location_id into v_location from public.reviews where id=p_review_id and user_id=auth.uid();
 if v_location is null then raise exception 'Review not found or not owned by current user'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'Amenity inventory must be an array'; end if;
 delete from public.review_amenity_feedback where review_id=p_review_id;
 for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
   v_amenity:=nullif(v_item->>'amenity_id','')::uuid;
   v_sentiment:=lower(coalesce(nullif(v_item->>'sentiment',''),'good'));
   v_qty:=case when v_item ? 'quantity' and nullif(v_item->>'quantity','') is not null then (v_item->>'quantity')::integer else null end;
   if v_amenity is null or not exists(select 1 from public.amenities where id=v_amenity) then raise exception 'Amenity not found'; end if;
   if v_sentiment not in ('good','needs_attention') then raise exception 'Invalid amenity sentiment'; end if;
   if v_qty is not null and (v_qty<0 or v_qty>1000) then raise exception 'Amenity quantity out of range'; end if;
   insert into public.review_amenity_feedback(review_id,location_id,amenity_id,sentiment,observed_quantity)
   values(p_review_id,v_location,v_amenity,v_sentiment,v_qty)
   on conflict do nothing;
   v_count:=v_count+1;
 end loop;
 return jsonb_build_object('review_id',p_review_id,'location_id',v_location,'recorded',v_count);
end $$;
revoke execute on function public.record_review_amenity_inventory(uuid,jsonb) from public,anon;
grant execute on function public.record_review_amenity_inventory(uuid,jsonb) to authenticated;

create or replace function public.submit_location_occupancy_observation(p_location_id uuid,p_occupancy_count integer,p_capacity_count integer default null,p_queue_count integer default null,p_wait_minutes numeric default null,p_confidence numeric default 0.75,p_observation_method text default 'user',p_check_in_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns public.location_occupancy_observations language plpgsql security invoker set search_path to 'public','auth','extensions','pg_temp' as $$
declare r public.location_occupancy_observations; v_check public.check_ins%rowtype; v_key text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.locations where id=p_location_id and is_active=true) then raise exception 'Canonical location not found or inactive'; end if;
 if p_occupancy_count<0 or p_occupancy_count>10000 then raise exception 'Occupancy count out of range'; end if;
 if p_capacity_count is not null and (p_capacity_count<=0 or p_capacity_count>10000) then raise exception 'Capacity count out of range'; end if;
 if p_queue_count is not null and (p_queue_count<0 or p_queue_count>10000) then raise exception 'Queue count out of range'; end if;
 if p_wait_minutes is not null and (p_wait_minutes<0 or p_wait_minutes>1440) then raise exception 'Wait time out of range'; end if;
 if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'Confidence out of range'; end if;
 if p_check_in_id is not null then
   select * into v_check from public.check_ins where id=p_check_in_id and user_id=auth.uid() and location_id=p_location_id;
   if not found then raise exception 'Check-in does not belong to this user and canonical location'; end if;
 end if;
 insert into public.location_occupancy_observations(location_id,user_id,check_in_id,occupancy_count,capacity_count,queue_count,wait_minutes,confidence,observation_method,metadata)
 values(p_location_id,auth.uid(),p_check_in_id,p_occupancy_count,p_capacity_count,p_queue_count,p_wait_minutes,p_confidence,coalesce(nullif(trim(p_observation_method),''),'user'),coalesce(p_metadata,'{}'::jsonb)) returning * into r;
 v_key:=md5(concat_ws('|',auth.uid()::text,'occupancy_observation',r.id::text));
 perform public.record_progression_metric_event('occupancy_observation','occupancy_observation',r.id,1,10,jsonb_build_object('idempotency_key',v_key,'location_id',p_location_id,'check_in_id',p_check_in_id,'server_authoritative',true));
 return r;
end $$;
revoke execute on function public.submit_location_occupancy_observation(uuid,integer,integer,integer,numeric,numeric,text,uuid,jsonb) from public,anon;
grant execute on function public.submit_location_occupancy_observation(uuid,integer,integer,integer,numeric,numeric,text,uuid,jsonb) to authenticated;

create or replace function public.get_location_occupancy_summary(p_location_id uuid)
returns jsonb language sql stable security definer set search_path to 'public','auth','extensions','pg_temp' as $$
 with recent as (
   select occupancy_count,capacity_count,queue_count,wait_minutes,confidence,observed_at
   from public.location_occupancy_observations
   where location_id=p_location_id and observed_at>=now()-interval '2 hours'
 ), agg as (
   select count(*)::int sample_count,
          round(avg(occupancy_count)::numeric,1) avg_occupancy_count,
          round(avg(capacity_count)::numeric,1) avg_capacity_count,
          round(avg(case when capacity_count>0 then occupancy_count::numeric/capacity_count*100 end)::numeric,1) avg_utilization_pct,
          round(avg(queue_count)::numeric,1) avg_queue_count,
          round(avg(wait_minutes)::numeric,1) avg_wait_minutes,
          round(avg(confidence)::numeric,2) confidence,
          max(observed_at) freshest_observed_at
   from recent
 )
 select jsonb_build_object('location_id',p_location_id,'window_minutes',120,'sample_count',sample_count,'occupancy_count',avg_occupancy_count,'capacity_count',avg_capacity_count,'utilization_pct',avg_utilization_pct,'queue_count',avg_queue_count,'wait_minutes',avg_wait_minutes,'confidence',confidence,'freshest_observed_at',freshest_observed_at,'fresh',freshest_observed_at is not null and freshest_observed_at>=now()-interval '30 minutes') from agg;
$$;
revoke execute on function public.get_location_occupancy_summary(uuid) from public;
grant execute on function public.get_location_occupancy_summary(uuid) to anon,authenticated;

create or replace function public.get_location_amenity_inventory(p_location_id uuid)
returns jsonb language sql stable security definer set search_path to 'public','auth','extensions','pg_temp' as $$
 with signals as (
   select amenity_id,observed_quantity,created_at observed_at from public.review_amenity_feedback where location_id=p_location_id and observed_quantity is not null and created_at>=now()-interval '180 days'
   union all
   select amenity_id,observed_quantity,observed_at from public.location_amenity_observations where location_id=p_location_id and status='present' and observed_quantity is not null and observed_at>=now()-interval '180 days'
 ), agg as (
   select amenity_id,round(avg(observed_quantity)::numeric)::int observed_quantity,count(*)::int sample_count,max(observed_at) freshest_observed_at from signals group by amenity_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('amenity_id',a.id,'name',a.name,'category',a.category,'observed_quantity',g.observed_quantity,'sample_count',coalesce(g.sample_count,0),'freshest_observed_at',g.freshest_observed_at) order by a.category,a.name),'[]'::jsonb)
 from public.amenities a
 left join agg g on g.amenity_id=a.id
 where exists(select 1 from public.location_amenities la where la.location_id=p_location_id and la.amenity_id=a.id) or g.amenity_id is not null;
$$;
revoke execute on function public.get_location_amenity_inventory(uuid) from public;
grant execute on function public.get_location_amenity_inventory(uuid) to anon,authenticated;

create or replace function public.materialize_fleet_operational_notification()
returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare v_event uuid; v_title text; v_body text; v_type text;
begin
 if new.business_id is null then return new; end if;
 if new.event_type not in ('route_completed','route_failed','route_cancelled','route_stop_completed','route_stop_skipped','job_completed','job_failed') then return new; end if;
 v_type:='fleet_'||new.event_type;
 v_title:=case when new.event_type in ('route_completed','job_completed','route_stop_completed') then 'Fleet job completed' when new.event_type in ('route_failed','job_failed') then 'Fleet job failed' when new.event_type='route_cancelled' then 'Fleet route cancelled' else 'Fleet stop needs attention' end;
 v_body:=case when new.event_type in ('route_completed','job_completed') then 'An assigned fleet job completed.' when new.event_type='route_stop_completed' then 'A route stop completed.' when new.event_type in ('route_failed','job_failed') then 'A fleet job reported a failure.' when new.event_type='route_cancelled' then 'A fleet route was cancelled.' else 'A route stop was skipped and may need follow-up.' end;
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
 values(v_type,null,(new.metadata->>'location_id')::uuid,'fleet',jsonb_build_object('title',v_title,'body',v_body,'business_id',new.business_id,'route_id',new.route_id,'vehicle_id',new.vehicle_id,'driver_id',new.driver_id,'source_event_id',new.id,'source_event_type',new.event_type,'occurred_at',new.occurred_at,'metadata',new.metadata),'fleet-operational:'||new.id::text,now()+interval '7 days')
 on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,expires_at=excluded.expires_at returning id into v_event;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_event,m.user_id,c.channel from public.app_business_memberships m cross join (values('in_app'::text),('push'::text)) c(channel)
 where m.business_id=new.business_id and m.role::text in ('owner','admin','manager','staff')
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 return new;
end $$;
drop trigger if exists trg_fleet_operational_notification on public.fleet_operational_events;
create trigger trg_fleet_operational_notification after insert on public.fleet_operational_events for each row execute function public.materialize_fleet_operational_notification();

create or replace function public.materialize_fleet_geofence_notification()
returns trigger language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare v_event uuid; v_title text; v_body text;
begin
 if new.business_id is null or new.event_type not in ('enter','entry','exit','dwell') then return new; end if;
 v_title:=case when new.event_type in ('enter','entry') then 'Fleet geofence entered' when new.event_type='exit' then 'Fleet geofence exited' else 'Fleet geofence dwell detected' end;
 v_body:=case when new.event_type in ('enter','entry') then 'A tracked fleet activity entered a configured geofence.' when new.event_type='exit' then 'A tracked fleet activity exited a configured geofence.' else 'A tracked fleet activity remained inside a geofence long enough to record dwell.' end;
 insert into public.notification_events(event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key,expires_at)
 values('fleet_geofence_'||new.event_type,new.user_id,new.location_id,'fleet',jsonb_build_object('title',v_title,'body',v_body,'business_id',new.business_id,'geofence_id',new.geofence_id,'source_event_id',new.id,'source_event_type',new.event_type,'dwell_seconds',new.dwell_seconds,'occurred_at',new.occurred_at,'metadata',new.metadata),'fleet-geofence:'||new.id::text,now()+interval '7 days')
 on conflict(dedupe_key) where dedupe_key is not null do update set payload=excluded.payload,expires_at=excluded.expires_at returning id into v_event;
 insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
 select v_event,m.user_id,c.channel from public.app_business_memberships m cross join (values('in_app'::text),('push'::text)) c(channel)
 where m.business_id=new.business_id and m.role::text in ('owner','admin','manager','staff')
 on conflict(notification_id,recipient_user_id,channel) do nothing;
 return new;
end $$;
drop trigger if exists trg_fleet_geofence_notification on public.geofence_events;
create trigger trg_fleet_geofence_notification after insert on public.geofence_events for each row execute function public.materialize_fleet_geofence_notification();
