create or replace function public.assign_fleet_metric(p_metric_definition_id uuid, p_target_type text, p_target_id uuid default null)
returns public.fleet_metric_assignments
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare
  d public.fleet_metric_definitions;
  v public.fleet_metric_assignments;
  t text := lower(trim(p_target_type));
  target_business uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into d from public.fleet_metric_definitions where id=p_metric_definition_id;
  if not found then raise exception 'Fleet metric definition not found'; end if;
  if not public.fleet_metric_controller_authorized(d.business_id) then raise exception 'Fleet controller authorization required'; end if;
  if t not in ('fleet','driver','vehicle','route') then raise exception 'Invalid Fleet metric target type'; end if;
  if (t='fleet')<>(p_target_id is null) then raise exception 'Target id mismatch'; end if;
  if t <> 'fleet' then
    if t='driver' then
      select business_id into target_business from public.fleet_drivers where id=p_target_id;
    elsif t='vehicle' then
      select business_id into target_business from public.fleet_vehicles where id=p_target_id;
    elsif t='route' then
      select business_id into target_business from public.fleet_routes where id=p_target_id;
    end if;
    if target_business is null then raise exception 'Fleet metric target not found'; end if;
    if target_business <> d.business_id then raise exception 'Fleet metric target belongs to a different business'; end if;
  end if;
  insert into public.fleet_metric_assignments(metric_definition_id,target_type,target_id)
  values(p_metric_definition_id,t,p_target_id)
  returning * into v;
  return v;
end
$$;
