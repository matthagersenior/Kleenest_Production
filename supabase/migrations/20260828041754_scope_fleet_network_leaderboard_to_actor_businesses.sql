create or replace function public.get_fleet_network_leaderboard(p_metric text default 'stops_completed'::text,p_limit integer default 20)
returns table(rank bigint,business_id uuid,business_name text,metric text,value numeric,network_contribution numeric,reward jsonb)
language sql security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $function$
  with actor_businesses as (
    select bm.business_id
    from public.business_members bm
    where bm.user_id=auth.uid()
    union
    select b.id
    from public.businesses b
    where public.is_platform_owner(auth.uid())
  ),
  fleets as (
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
    where coalesce(b.is_demo_test,false)=false
      and exists(select 1 from actor_businesses ab where ab.business_id=f.business_id)
      and public.has_fleet_access(f.business_id)
    group by f.business_id,b.name
  ), ranked as (
    select row_number() over(order by value desc nulls last,business_id) r,business_id,name,value from fleets
  )
  select r.r,r.business_id,r.name,lower(p_metric),r.value,
    case when max(r.value) over() > 0 then round((r.value/nullif(max(r.value) over(),0))*100,2) else 0 end,
    (select coalesce(jsonb_agg(to_jsonb(lr) order by lr.rank_from desc),'[]'::jsonb)
     from public.leaderboard_rewards lr
     where lr.active
       and lr.leaderboard_key='fleet_network:'||lower(p_metric)
       and r.r between lr.rank_from and lr.rank_to)
  from ranked r
  order by r.r
  limit greatest(1,least(coalesce(p_limit,20),100));
$function$;
