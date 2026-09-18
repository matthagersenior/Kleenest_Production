grant select on table public.fleet_operational_events to authenticated;
grant select on table public.fleet_performance_events to authenticated;
grant select on table public.fleet_vehicle_daily_metrics to authenticated;
revoke all on table public.fleet_operational_events from anon;
revoke all on table public.fleet_performance_events from anon;
revoke all on table public.fleet_vehicle_daily_metrics from anon;
