create table if not exists public.leaderboard_rewards (
  id uuid primary key default gen_random_uuid(),
  leaderboard_key text not null,
  rank_from integer not null default 1,
  rank_to integer not null default 1,
  reward_type text not null,
  reward_value jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rank_from >= 1 and rank_to >= rank_from)
);

create index if not exists leaderboard_rewards_key_idx on public.leaderboard_rewards(leaderboard_key, active, rank_from);

create or replace function public.get_fleet_leaderboard(
  p_business_id uuid,
  p_metric text default 'safety_score',
  p_target_type text default 'driver',
  p_limit integer default 20
) returns table (
  rank bigint,
  business_id uuid,
  target_id uuid,
  target_type text,
  metric text,
  value numeric,
  score numeric,
  network_visible boolean
) language plpgsql security definer set search_path=public as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,20),100));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_fleet_access(p_business_id) then raise exception 'Fleet access required'; end if;
  if lower(coalesce(p_target_type,''))='driver' then
    return query
      select row_number() over(order by coalesce(avg(s.safety_score),0) desc, s.driver_id),
             s.business_id,s.driver_id,'driver',lower(p_metric),
             case lower(p_metric)
               when 'safety_score' then avg(s.safety_score)
               when 'efficiency_score' then avg(s.efficiency_score)
               when 'route_completion_score' then avg(s.route_completion_score)
               when 'idle_minutes' then avg(s.idle_minutes)
               when 'harsh_braking_count' then avg(s.harsh_braking_count)
               when 'harsh_acceleration_count' then avg(s.harsh_acceleration_count)
               when 'speeding_events' then avg(s.speeding_events)
               when 'collision_events' then avg(s.collision_events)
               when 'seatbelt_events' then avg(s.seatbelt_events)
               else avg(s.safety_score)
             end,
             case lower(p_metric) when 'safety_score' then avg(s.safety_score) when 'efficiency_score' then avg(s.efficiency_score) when 'route_completion_score' then avg(s.route_completion_score) else null end,
             true
      from public.fleet_driver_scorecards s
      where s.business_id=p_business_id
      group by s.business_id,s.driver_id
      order by value desc nulls last,target_id
      limit v_limit;
  elsif lower(p_target_type)='fleet' then
    return query
      select row_number() over(order by value desc nulls last,business_id),business_id,null::uuid,'fleet',lower(p_metric),value,value,true
      from (
        select f.business_id,
          case lower(p_metric)
            when 'vehicles_active' then avg(f.vehicles_active)::numeric
            when 'routes_completed' then sum(f.routes_completed)::numeric
            when 'stops_completed' then sum(f.stops_completed)::numeric
            when 'restroom_coverage_score' then avg(f.restroom_coverage_score)::numeric
            when 'average_stop_distance_miles' then avg(f.average_stop_distance_miles)::numeric
            when 'estimated_time_saved_minutes' then sum(f.estimated_time_saved_minutes)::numeric
            else sum(f.stops_completed)::numeric
          end value
        from public.fleet_metric_snapshots f
        where f.business_id=p_business_id
        group by f.business_id
      ) x;
  else
    raise exception 'Unsupported Fleet leaderboard target type: %',p_target_type;
  end if;
end;
$$;

create or replace function public.get_fleet_network_leaderboard(
  p_metric text default 'stops_completed',
  p_limit integer default 20
) returns table (
  rank bigint,
  business_id uuid,
  business_name text,
  metric text,
  value numeric,
  network_contribution numeric,
  reward jsonb
) language sql security definer set search_path=public as $$
  with fleets as (
    select f.business_id,b.name,
      case lower(p_metric)
        when 'vehicles_active' then avg(f.vehicles_active)::numeric
        when 'routes_completed' then sum(f.routes_completed)::numeric
        when 'stops_completed' then sum(f.stops_completed)::numeric
        when 'restroom_coverage_score' then avg(f.restroom_coverage_score)::numeric
        when 'average_stop_distance_miles' then avg(f.average_stop_distance_miles)::numeric
        when 'estimated_time_saved_minutes' then sum(f.estimated_time_saved_minutes)::numeric
        else sum(f.stops_completed)::numeric
      end value
    from public.fleet_metric_snapshots f
    join public.businesses b on b.id=f.business_id
    where coalesce(b.is_demo_test,false)=false and public.has_fleet_access(f.business_id)
    group by f.business_id,b.name
  ), ranked as (
    select row_number() over(order by value desc nulls last,business_id) r,business_id,name,value from fleets
  )
  select r.r,r.business_id,r.name,lower(p_metric),r.value,
    case when max(r.value) over() > 0 then round((r.value/nullif(max(r.value) over(),0))*100,2) else 0 end,
    (select coalesce(jsonb_agg(to_jsonb(lr) order by lr.rank_from desc),'[]'::jsonb) from public.leaderboard_rewards lr where lr.active and lr.leaderboard_key='fleet_network:'||lower(p_metric) and r.r between lr.rank_from and lr.rank_to)
  from ranked r order by r.r limit greatest(1,least(coalesce(p_limit,20),100));
$$;

create or replace function public.get_platform_leaderboard(
  p_leaderboard_key text default 'users:points',
  p_limit integer default 20
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_key text:=lower(trim(p_leaderboard_key)); v_result jsonb;
begin
  if v_key='users:points' then
    select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'user_id',id,'display_name',display_name,'username',username,'points',points,'level',level,'streak',streak)), '[]'::jsonb) into v_result
    from public.get_user_leaderboard(greatest(1,least(coalesce(p_limit,20),100)));
  elsif v_key like 'business:%' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result from public.get_business_leaderboard(replace(v_key,'business:',''),greatest(1,least(coalesce(p_limit,20),100))) x;
  elsif v_key like 'fleet_network:%' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_result from public.get_fleet_network_leaderboard(replace(v_key,'fleet_network:',''),greatest(1,least(coalesce(p_limit,20),100))) x;
  else raise exception 'Unknown leaderboard: %',p_leaderboard_key;
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_fleet_leaderboard(uuid,text,text,integer) from public;
revoke all on function public.get_fleet_network_leaderboard(text,integer) from public;
revoke all on function public.get_platform_leaderboard(text,integer) from public;
grant execute on function public.get_fleet_leaderboard(uuid,text,text,integer) to authenticated;
grant execute on function public.get_fleet_network_leaderboard(text,integer) to authenticated;
grant execute on function public.get_platform_leaderboard(text,integer) to authenticated;
