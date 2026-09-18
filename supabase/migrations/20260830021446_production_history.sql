create table if not exists public.fleet_dispatch_signal_policies (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  occupancy_enabled boolean not null default true,
  occupancy_fresh_minutes integer not null default 30 check (occupancy_fresh_minutes between 5 and 240),
  high_utilization_pct numeric not null default 80 check (high_utilization_pct between 0 and 100),
  queue_threshold integer not null default 1 check (queue_threshold between 0 and 10000),
  high_utilization_weight integer not null default 15 check (high_utilization_weight between 0 and 100),
  queue_weight integer not null default 10 check (queue_weight between 0 and 100),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.fleet_dispatch_signal_policies enable row level security;
grant select,insert,update on public.fleet_dispatch_signal_policies to authenticated;

drop policy if exists fleet_dispatch_signal_policy_select on public.fleet_dispatch_signal_policies;
create policy fleet_dispatch_signal_policy_select on public.fleet_dispatch_signal_policies
for select to authenticated using (public.fleet_observe_access(business_id));

drop policy if exists fleet_dispatch_signal_policy_insert on public.fleet_dispatch_signal_policies;
create policy fleet_dispatch_signal_policy_insert on public.fleet_dispatch_signal_policies
for insert to authenticated with check (
  exists(select 1 from public.app_business_memberships bm where bm.business_id=fleet_dispatch_signal_policies.business_id and bm.user_id=auth.uid() and bm.role::text in ('owner','admin','manager'))
);

drop policy if exists fleet_dispatch_signal_policy_update on public.fleet_dispatch_signal_policies;
create policy fleet_dispatch_signal_policy_update on public.fleet_dispatch_signal_policies
for update to authenticated using (
  exists(select 1 from public.app_business_memberships bm where bm.business_id=fleet_dispatch_signal_policies.business_id and bm.user_id=auth.uid() and bm.role::text in ('owner','admin','manager'))
) with check (
  exists(select 1 from public.app_business_memberships bm where bm.business_id=fleet_dispatch_signal_policies.business_id and bm.user_id=auth.uid() and bm.role::text in ('owner','admin','manager'))
);

create or replace function public.fleet_dispatch_signal_policy(p_business_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare p public.fleet_dispatch_signal_policies%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 select * into p from public.fleet_dispatch_signal_policies where business_id=p_business_id;
 return jsonb_build_object(
  'business_id',p_business_id,
  'occupancy_enabled',coalesce(p.occupancy_enabled,true),
  'occupancy_fresh_minutes',coalesce(p.occupancy_fresh_minutes,30),
  'high_utilization_pct',coalesce(p.high_utilization_pct,80),
  'queue_threshold',coalesce(p.queue_threshold,1),
  'high_utilization_weight',coalesce(p.high_utilization_weight,15),
  'queue_weight',coalesce(p.queue_weight,10),
  'configured',found
 );
end $$;
revoke all on function public.fleet_dispatch_signal_policy(uuid) from public,anon;
grant execute on function public.fleet_dispatch_signal_policy(uuid) to authenticated;

create or replace function public.fleet_update_dispatch_signal_policy(
 p_business_id uuid,
 p_occupancy_enabled boolean default true,
 p_occupancy_fresh_minutes integer default 30,
 p_high_utilization_pct numeric default 80,
 p_queue_threshold integer default 1,
 p_high_utilization_weight integer default 15,
 p_queue_weight integer default 10
) returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.app_business_memberships bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role::text in ('owner','admin','manager')) then raise exception 'Fleet manager access required'; end if;
 if p_occupancy_fresh_minutes not between 5 and 240 then raise exception 'Occupancy freshness window out of range'; end if;
 if p_high_utilization_pct<0 or p_high_utilization_pct>100 then raise exception 'Utilization threshold out of range'; end if;
 if p_queue_threshold<0 or p_queue_threshold>10000 then raise exception 'Queue threshold out of range'; end if;
 if p_high_utilization_weight<0 or p_high_utilization_weight>100 or p_queue_weight<0 or p_queue_weight>100 then raise exception 'Priority weight out of range'; end if;
 insert into public.fleet_dispatch_signal_policies(business_id,occupancy_enabled,occupancy_fresh_minutes,high_utilization_pct,queue_threshold,high_utilization_weight,queue_weight,updated_by,updated_at)
 values(p_business_id,coalesce(p_occupancy_enabled,true),p_occupancy_fresh_minutes,p_high_utilization_pct,p_queue_threshold,p_high_utilization_weight,p_queue_weight,auth.uid(),now())
 on conflict(business_id) do update set occupancy_enabled=excluded.occupancy_enabled,occupancy_fresh_minutes=excluded.occupancy_fresh_minutes,high_utilization_pct=excluded.high_utilization_pct,queue_threshold=excluded.queue_threshold,high_utilization_weight=excluded.high_utilization_weight,queue_weight=excluded.queue_weight,updated_by=auth.uid(),updated_at=now();
 return public.fleet_dispatch_signal_policy(p_business_id);
end $$;
revoke all on function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) from public,anon;
grant execute on function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) to authenticated;

create or replace function public.submit_amenity_observation(p_location_id uuid, p_amenity_id uuid, p_status text, p_confidence numeric default null::numeric, p_verification_method text default 'user'::text, p_check_in_id uuid default null::uuid, p_photo_id uuid default null::uuid, p_notes text default null::text, p_metadata jsonb default '{}'::jsonb)
returns public.location_amenity_observations
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare uid uuid:=auth.uid(); r public.location_amenity_observations; v_check public.check_ins%rowtype; v_eligible boolean:=false; v_key text; v_status text:=lower(coalesce(p_status,'')); v_quantity integer;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.locations where id=p_location_id and is_active=true) then raise exception 'Canonical location not found or inactive'; end if;
 if not exists(select 1 from public.amenities where id=p_amenity_id) then raise exception 'Amenity not found'; end if;
 if v_status not in ('present','absent','unknown') then raise exception 'Amenity status must be present, absent, or unknown'; end if;
 if p_metadata ? 'observed_quantity' then
   begin v_quantity:=(p_metadata->>'observed_quantity')::integer; exception when others then raise exception 'Amenity quantity must be an integer'; end;
 end if;
 if v_status='present' then v_quantity:=coalesce(v_quantity,1); if v_quantity<1 or v_quantity>10000 then raise exception 'Present amenity quantity out of range'; end if;
 elsif v_status='absent' then v_quantity:=0;
 else if v_quantity is not null and (v_quantity<0 or v_quantity>10000) then raise exception 'Amenity quantity out of range'; end if; end if;
 if p_check_in_id is not null then
   select * into v_check from public.check_ins where id=p_check_in_id;
   if not found or v_check.user_id<>uid or v_check.location_id<>p_location_id then raise exception 'Check-in does not belong to this user and canonical location'; end if;
   if v_check.checked_in_at>now()+interval '5 minutes' then raise exception 'Check-in timestamp is not valid'; end if;
   v_eligible:=public.is_qualifying_return_visit(uid,p_location_id,v_check.checked_in_at);
 end if;
 insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,observed_quantity,confidence,verification_method,check_in_id,photo_id,notes,observed_at,metadata)
 values(p_location_id,uid,p_amenity_id,v_status,v_quantity,p_confidence,p_verification_method,p_check_in_id,p_photo_id,p_notes,now(),coalesce(p_metadata,'{}')) returning * into r;
 if v_eligible and p_check_in_id is not null then
   v_key:=md5(concat_ws('|',uid::text,'amenity_observation',p_check_in_id::text,p_location_id::text,p_amenity_id::text));
   perform public.record_progression_metric_event('verification','amenity_observation',r.id,1,15,jsonb_build_object('idempotency_key',v_key,'location_id',p_location_id,'amenity_id',p_amenity_id,'observed_quantity',v_quantity,'check_in_id',p_check_in_id,'evidence_id',r.id,'evidence_type','amenity_observation','server_authoritative',true));
 end if;
 return r;
end $$;

create or replace function public.record_gamification_activity(p_activity text, p_reference_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
 u uuid:=auth.uid(); today date:=current_date; s public.user_streaks; awarded_points integer; total_points integer:=0; new_level integer:=1; activity text:=lower(trim(coalesce(p_activity,''))); inserted boolean:=false; challenge_reward integer:=0; v_location uuid; v_checkin uuid; v_checkin_at timestamptz; v_eligible boolean:=true; v_daily integer:=0;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if activity not in ('check_in','verification','occupancy_observation','review','favorite','qr_scan','route_completed','route_stop_completed','social_post','social_contribution','share','event_rsvp','contest_entry','location_diversity','community','challenge_completed') then raise exception 'Unsupported gamification activity: %',activity; end if;
 if activity in ('check_in','review') then
  perform pg_advisory_xact_lock(hashtextextended('kleenest:progression:'||u::text,0));
  if activity='check_in' then
   select c.location_id,c.checked_in_at into v_location,v_checkin_at from public.check_ins c where c.id=p_reference_id and c.user_id=u;
   v_checkin:=p_reference_id;
   if v_checkin is null then v_eligible:=false; end if;
  else
   select r.location_id,r.check_in_id,c.checked_in_at into v_location,v_checkin,v_checkin_at from public.reviews r left join public.check_ins c on c.id=r.check_in_id and c.user_id=u where r.id=p_reference_id and r.user_id=u;
   if p_reference_id is not null and exists(select 1 from public.point_transactions pt where pt.user_id=u and pt.reason='review' and pt.reference_id=p_reference_id) then v_eligible:=false; end if;
  end if;
  if v_location is null or v_checkin_at is null then v_eligible:=false; end if;
  if activity='check_in' and v_eligible then if exists(select 1 from public.point_transactions pt where pt.user_id=u and pt.reason='check_in' and pt.reference_id=v_checkin) then v_eligible:=false; end if; end if;
  if v_eligible then if exists(select 1 from public.check_ins c where c.user_id=u and c.location_id=v_location and c.checked_in_at < v_checkin_at and not exists(select 1 from public.location_departures d where d.user_id=u and d.location_id=v_location and d.left_at > c.checked_in_at and d.left_at <= v_checkin_at)) then v_eligible:=false; end if; end if;
  select count(*)::integer into v_daily from public.point_transactions where user_id=u and reason in ('check_in','review') and created_at >= date_trunc('day',v_checkin_at) and created_at < date_trunc('day',v_checkin_at)+interval '1 day';
  if v_daily>=5 then v_eligible:=false; end if;
  if not v_eligible then return jsonb_build_object('activity',activity,'awarded_points',0,'new_activity',false,'reason',case when v_daily>=5 then 'daily_progression_cap_reached' else 'progression_not_eligible' end); end if;
 end if;
 select * into s from public.user_streaks where user_id=u for update;
 if not found then insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at) values(u,1,1,today,now()) returning * into s;
 elsif s.last_activity_date=today then update public.user_streaks set updated_at=now() where user_id=u returning * into s;
 elsif s.last_activity_date=today-1 then update public.user_streaks set current_streak=current_streak+1,longest_streak=greatest(longest_streak,current_streak+1),last_activity_date=today,updated_at=now() where user_id=u returning * into s;
 else update public.user_streaks set current_streak=1,longest_streak=greatest(longest_streak,1),last_activity_date=today,streak_started_at=now(),updated_at=now() where user_id=u returning * into s; end if;
 if activity='challenge_completed' then select greatest(coalesce(reward_points,0),0) into challenge_reward from public.progression_challenges where id=p_reference_id and enabled=true; if not found then raise exception 'Challenge is unavailable'; end if; awarded_points:=challenge_reward;
 else awarded_points:=case activity when 'check_in' then 10 when 'verification' then 15 when 'occupancy_observation' then 10 when 'review' then 25 when 'favorite' then 5 when 'qr_scan' then 5 when 'route_completed' then 25 when 'route_stop_completed' then 5 when 'social_post' then 5 when 'social_contribution' then 5 when 'share' then 3 when 'event_rsvp' then 3 when 'contest_entry' then 5 when 'location_diversity' then 10 else 5 end; end if;
 if s.current_streak>=7 then awarded_points:=awarded_points+5; end if;
 if p_reference_id is not null then insert into public.point_transactions(user_id,points,reason,reference_id) values(u,awarded_points,activity,p_reference_id) on conflict (user_id,reason,reference_id) where reference_id is not null do nothing; inserted:=found;
 else insert into public.point_transactions(user_id,points,reason) values(u,awarded_points,activity); inserted:=true; end if;
 select coalesce(sum(points),0)::integer into total_points from public.point_transactions where user_id=u;
 select coalesce((select level from public.level_definitions where min_points<=total_points and (max_points is null or total_points<=max_points) order by level desc limit 1),1) into new_level;
 update public.profiles set points=total_points,level=new_level,streak=s.current_streak,updated_at=now() where id=u;
 perform public.evaluate_user_badges(u);
 return jsonb_build_object('activity',activity,'awarded_points',case when inserted then awarded_points else 0 end,'points',total_points,'level',new_level,'current_streak',s.current_streak,'longest_streak',s.longest_streak,'new_activity',inserted);
end $$;

create or replace function public.fleet_dispatch_intelligence(p_business_id uuid, p_route_id uuid default null::uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  v_route public.fleet_routes;
  v_candidates jsonb;
  v_drivers jsonb;
  v_vehicles jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_policy jsonb;
  v_occ_enabled boolean;
  v_occ_fresh_minutes integer;
  v_high_util numeric;
  v_queue_threshold integer;
  v_high_weight integer;
  v_queue_weight integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if p_route_id is not null then select * into v_route from public.fleet_routes where id=p_route_id and business_id=p_business_id; if not found then raise exception 'Route not found'; end if; end if;
  v_policy:=public.fleet_dispatch_signal_policy(p_business_id);
  v_occ_enabled:=coalesce((v_policy->>'occupancy_enabled')::boolean,true);
  v_occ_fresh_minutes:=coalesce((v_policy->>'occupancy_fresh_minutes')::integer,30);
  v_high_util:=coalesce((v_policy->>'high_utilization_pct')::numeric,80);
  v_queue_threshold:=coalesce((v_policy->>'queue_threshold')::integer,1);
  v_high_weight:=coalesce((v_policy->>'high_utilization_weight')::integer,15);
  v_queue_weight:=coalesce((v_policy->>'queue_weight')::integer,10);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.name),'[]'::jsonb) into v_candidates
  from (
    select o.location_id,o.name,o.latitude,o.longitude,o.bathroom_verification_status,o.rating,o.accessible,o.changing_table,o.amenity_count,o.quality_observation_count,o.verified_bathroom,o.needs_fresh_observation,
      occ.summary as occupancy_summary,
      (case when coalesce(o.needs_fresh_observation,0)>0 then 50 else 0 end
       + case when coalesce(o.verified_bathroom,0)=0 then 30 else 0 end
       + case when o.rating is null then 10 when o.rating<3 then 20 else 0 end
       + case when coalesce(o.quality_observation_count,0)=0 then 15 else 0 end
       + case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'utilization_pct')::numeric,0)>=v_high_util then v_high_weight else 0 end
       + case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'queue_count')::numeric,0)>=v_queue_threshold then v_queue_weight else 0 end)::integer priority_score,
      array_remove(array[
        case when coalesce(o.needs_fresh_observation,0)>0 then 'needs fresh observation' end,
        case when coalesce(o.verified_bathroom,0)=0 then 'bathroom not verified' end,
        case when o.rating is null then 'rating missing' when o.rating<3 then 'low rating' end,
        case when coalesce(o.quality_observation_count,0)=0 then 'no quality observations' end,
        case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'utilization_pct')::numeric,0)>=v_high_util then 'current utilization meets configured threshold' end,
        case when v_occ_enabled and (occ.summary->>'freshest_observed_at') is not null and (occ.summary->>'freshest_observed_at')::timestamptz>=now()-make_interval(mins=>v_occ_fresh_minutes) and coalesce((occ.summary->>'queue_count')::numeric,0)>=v_queue_threshold then 'current queue meets configured threshold' end
      ],null) reasons
    from public.fleet_service_opportunities_for_business(p_business_id) o
    left join lateral (select public.get_location_occupancy_summary(o.location_id) summary) occ on true
    where not exists(select 1 from public.fleet_route_stops s where s.route_id=p_route_id and s.location_id=o.location_id)
    order by priority_score desc,o.name
    limit v_limit
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'status',d.status,'vehicle_id',d.vehicle_id,'user_id',d.user_id,'ready',d.status='active') order by (d.status='active') desc,d.name),'[]'::jsonb) into v_drivers from public.fleet_drivers d where d.business_id=p_business_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'unit_code',v.unit_code,'status',v.status,'vehicle_type',v.vehicle_type,'driver_name',v.driver_name,'ready',v.status='active') order by (v.status='active') desc,v.name),'[]'::jsonb) into v_vehicles from public.fleet_vehicles v where v.business_id=p_business_id;

  return jsonb_build_object('business_id',p_business_id,'route_id',p_route_id,'route',case when p_route_id is null then null else jsonb_build_object('id',v_route.id,'name',v_route.name,'status',v_route.status,'driver_id',v_route.driver_id,'vehicle_id',v_route.vehicle_id,'scheduled_for',v_route.scheduled_for,'dispatch_locked',v_route.dispatch_locked,'stops_count',v_route.stops_count) end,'candidate_stops',v_candidates,'drivers',v_drivers,'vehicles',v_vehicles,'dispatch_signal_policy',v_policy,'generated_at',now(),'model','authoritative_dispatch_intelligence_v2');
end $$;
revoke all on function public.fleet_dispatch_intelligence(uuid,uuid,integer) from public,anon;
grant execute on function public.fleet_dispatch_intelligence(uuid,uuid,integer) to authenticated;
