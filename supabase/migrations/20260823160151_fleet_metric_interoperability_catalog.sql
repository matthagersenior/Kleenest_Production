-- Fleet metric interoperability catalog
create or replace function public.get_fleet_metric_capabilities(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_capabilities jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_fleet_access(p_business_id) then
    raise exception 'Fleet access required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.domain, x.metric_key), '[]'::jsonb)
  into v_capabilities
  from (
    select 'fleet'::text as domain,'fleet_routes'::text as source_dataset,'routes_completed'::text as metric_key,'count'::text as aggregation,'route'::text as natural_scope,'count'::text as unit,'existing_fleet_snapshot'::text as source_kind,'Route completion from fleet_metric_snapshots.'::text as description,jsonb_build_array('live_network','notifications','leaderboards','progression') as interoperability
    union all select 'fleet','fleet_metric_snapshots','stops_completed','count','fleet','count','existing_fleet_snapshot','Completed stops from fleet_metric_snapshots.',jsonb_build_array('live_network','notifications','feedback','routing')
    union all select 'fleet','fleet_metric_snapshots','vehicles_active','count','fleet','count','existing_fleet_snapshot','Active vehicles from fleet_metric_snapshots.',jsonb_build_array('live_network','notifications')
    union all select 'fleet','fleet_metric_snapshots','restroom_coverage_score','avg','fleet','score','existing_fleet_snapshot','Restroom coverage score from fleet_metric_snapshots.',jsonb_build_array('quality','feedback','notifications','progression')
    union all select 'fleet','fleet_metric_snapshots','average_stop_distance_miles','avg','fleet','miles','existing_fleet_snapshot','Average stop distance from fleet_metric_snapshots.',jsonb_build_array('routing','live_network','notifications')
    union all select 'fleet','fleet_metric_snapshots','estimated_time_saved_minutes','sum','fleet','minutes','existing_fleet_snapshot','Estimated time saved from fleet_metric_snapshots.',jsonb_build_array('routing','notifications','leaderboards')
    union all select 'fleet','fleet_driver_scorecards','safety_score','avg','driver','score','existing_fleet_scorecard','Driver safety score from fleet_driver_scorecards.',jsonb_build_array('progression','leaderboards','notifications')
    union all select 'fleet','fleet_driver_scorecards','efficiency_score','avg','driver','score','existing_fleet_scorecard','Driver efficiency score from fleet_driver_scorecards.',jsonb_build_array('progression','leaderboards','notifications')
    union all select 'fleet','fleet_driver_scorecards','route_completion_score','avg','driver','score','existing_fleet_scorecard','Driver route completion score from fleet_driver_scorecards.',jsonb_build_array('routing','progression','leaderboards','notifications')
    union all select 'fleet','fleet_driver_scorecards','idle_minutes','sum','driver','minutes','existing_fleet_scorecard','Driver idle minutes from fleet_driver_scorecards.',jsonb_build_array('routing','notifications','leaderboards')
    union all select 'fleet','fleet_driver_scorecards','speeding_events','sum','driver','events','existing_fleet_scorecard','Driver speeding events from fleet_driver_scorecards.',jsonb_build_array('progression','notifications','leaderboards')
    union all select 'fleet','fleet_driver_scorecards','collision_events','sum','driver','events','existing_fleet_scorecard','Driver collision events from fleet_driver_scorecards.',jsonb_build_array('notifications','progression','leaderboards')
    union all select 'fleet','fleet_driver_scorecards','seatbelt_events','sum','driver','events','existing_fleet_scorecard','Driver seatbelt events from fleet_driver_scorecards.',jsonb_build_array('progression','notifications')
    union all select 'fleet','fleet_performance_events','metrics','latest','route','json','fleet_performance_event','Raw performance metrics payload for route/vehicle/driver operational facts.',jsonb_build_array('live_network','routing','notifications','feedback')
    union all select 'fleet','fleet_operational_events','value','sum','fleet','numeric','fleet_operational_event','Canonical operational event value/unit stream.',jsonb_build_array('live_network','notifications','progression','leaderboards')
    union all select 'network','live_network_events','event_count','count','location','events','live_network_event','Live activity/event volume associated with Fleet operations.',jsonb_build_array('intelligence','notifications','routing','feedback')
    union all select 'quality','location_quality_observations','quality_signals','avg','location','score','quality_observation','User-submitted location quality evidence.',jsonb_build_array('feedback','intelligence','notifications','routing')
    union all select 'routing','route_events','event_count','count','route','events','route_event','Canonical route lifecycle/event volume.',jsonb_build_array('live_network','notifications','offline','feedback')
    union all select 'routing','route_stops','stop_count','count','route','stops','route_stop','Canonical route stop population.',jsonb_build_array('live_network','notifications','feedback','offline')
    union all select 'feedback','user_feedback','feedback_count','count','business','events','user_feedback','User feedback volume available for operational feedback loops.',jsonb_build_array('quality','intelligence','notifications')
    union all select 'feedback','review_amenity_feedback','amenity_feedback_count','count','location','events','review_feedback','Review amenity feedback volume.',jsonb_build_array('quality','intelligence','notifications')
    union all select 'enterprise','enterprise_partner_network_metrics','network_metrics','latest','network','json','enterprise_network_metric','Existing enterprise partner network analytics.',jsonb_build_array('live_network','leaderboards','notifications')
  ) x;
  return jsonb_build_object('business_id',p_business_id,'measurement_sources',v_capabilities,'shared_primitives',jsonb_build_array('progression_metric_events','progression_challenges','progression_games','business_metric_leaderboards','notification_events','live_network_events'),'rule','Fleet metric definitions reference these existing capabilities; they do not replace their source-of-truth semantics.');
end;
$$;
revoke all on function public.get_fleet_metric_capabilities(uuid) from public, anon;
grant execute on function public.get_fleet_metric_capabilities(uuid) to authenticated;
comment on function public.get_fleet_metric_capabilities(uuid) is 'Returns the interoperable Fleet metric source catalog. This is a capability registry/read model, not a metrics calculation engine.';
