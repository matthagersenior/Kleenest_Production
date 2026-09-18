grant execute on function public.fleet_actor_is_manager(uuid) to authenticated;
grant execute on function public.fleet_metric_controller_authorized(uuid) to authenticated;

create or replace function public.create_fleet_metric_definition(
  p_business_id uuid,
  p_metric_key text,
  p_feature_code text,
  p_name text,
  p_description text default null,
  p_unit text default null,
  p_source_dataset text default null,
  p_source_metric text default null,
  p_aggregation text default 'avg',
  p_direction text default 'higher_is_better',
  p_scoring_method text default 'threshold',
  p_goal numeric default null,
  p_threshold numeric default null,
  p_max_score numeric default 100,
  p_scoring_config jsonb default '{}'::jsonb,
  p_period text default 'week'
) returns public.fleet_metric_definitions
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.fleet_metric_definitions;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.fleet_metric_controller_authorized(p_business_id) then raise exception 'Fleet controller authorization required'; end if;

  insert into public.fleet_metric_definitions(
    business_id, created_by, metric_key, feature_code, name, description, unit,
    source_dataset, source_metric, aggregation, direction, scoring_method,
    goal, threshold, max_score, scoring_config, period
  ) values (
    p_business_id, auth.uid(), p_metric_key, p_feature_code, p_name, p_description, p_unit,
    p_source_dataset, p_source_metric, p_aggregation, p_direction, p_scoring_method,
    p_goal, p_threshold, p_max_score, coalesce(p_scoring_config,'{}'::jsonb), p_period
  ) returning * into v;

  return v;
end
$$;

grant execute on function public.create_fleet_metric_definition(uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,jsonb,text) to authenticated;
