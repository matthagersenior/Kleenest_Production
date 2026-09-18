create or replace function public.toggle_follow_user(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_following boolean;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_target_user_id is null or p_target_user_id=v_user then raise exception 'Choose another user'; end if;
 if not exists(select 1 from public.profiles where id=p_target_user_id) then raise exception 'User not found'; end if;
 if exists(select 1 from public.follows where follower_id=v_user and following_id=p_target_user_id) then
   delete from public.follows where follower_id=v_user and following_id=p_target_user_id; v_following:=false;
 else
   insert into public.follows(follower_id,following_id) values(v_user,p_target_user_id); v_following:=true;
   perform public.evaluate_user_badges(v_user);
 end if;
 return jsonb_build_object('following',v_following,'follower_id',v_user,'following_id',p_target_user_id);
end $$;

revoke execute on function public.toggle_follow_user(uuid) from public, anon;
grant execute on function public.toggle_follow_user(uuid) to authenticated;

create or replace function public.fleet_operational_signal_summary(p_business_id uuid,p_window_hours integer default 24)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v_hours integer:=least(greatest(coalesce(p_window_hours,24),1),168); v_since timestamptz; v_geofence jsonb; v_ops jsonb; v_recent jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 v_since:=now()-(v_hours||' hours')::interval;
 select jsonb_build_object(
   'events',count(*)::int,
   'entries',count(*) filter(where lower(event_type) in ('enter','entered','entry'))::int,
   'exits',count(*) filter(where lower(event_type) in ('exit','exited'))::int,
   'dwells',count(*) filter(where lower(event_type) like '%dwell%')::int,
   'avg_dwell_seconds',round(avg(dwell_seconds) filter(where dwell_seconds is not null)::numeric,1),
   'latest_at',max(occurred_at)
 ) into v_geofence from public.geofence_events where business_id=p_business_id and occurred_at>=v_since;
 select jsonb_build_object(
   'events',count(*)::int,
   'route_completed',count(*) filter(where lower(event_type)='route_completed')::int,
   'route_failed',count(*) filter(where lower(event_type)='route_failed')::int,
   'job_completed',count(*) filter(where lower(event_type)='job_completed')::int,
   'job_failed',count(*) filter(where lower(event_type)='job_failed')::int,
   'latest_at',max(occurred_at)
 ) into v_ops from public.fleet_operational_events where business_id=p_business_id and occurred_at>=v_since;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc),'[]'::jsonb) into v_recent from (
   select id,event_type,route_id,vehicle_id,driver_id,occurred_at,metadata
   from public.fleet_operational_events
   where business_id=p_business_id and occurred_at>=v_since
   order by occurred_at desc limit 20
 ) x;
 return jsonb_build_object('business_id',p_business_id,'window_hours',v_hours,'since',v_since,'geofence',coalesce(v_geofence,'{}'::jsonb),'operations',coalesce(v_ops,'{}'::jsonb),'recent_operational_events',v_recent,'generated_at',now());
end $$;
revoke execute on function public.fleet_operational_signal_summary(uuid,integer) from public, anon;
grant execute on function public.fleet_operational_signal_summary(uuid,integer) to authenticated;
