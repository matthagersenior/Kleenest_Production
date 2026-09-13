
create or replace function public.get_fleet_metric_configuration(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not public.fleet_metric_controller_authorized(p_business_id) then
    raise exception 'Fleet controller authorization required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'definitions',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',d.id,
          'business_id',d.business_id,
          'metric_key',d.metric_key,
          'feature_code',d.feature_code,
          'name',d.name,
          'description',d.description,
          'unit',d.unit,
          'source_dataset',d.source_dataset,
          'source_metric',d.source_metric,
          'aggregation',d.aggregation,
          'direction',d.direction,
          'scoring_method',d.scoring_method,
          'goal',d.goal,
          'threshold',d.threshold,
          'max_score',d.max_score,
          'scoring_config',d.scoring_config,
          'period',d.period,
          'active',d.active,
          'created_at',d.created_at,
          'updated_at',d.updated_at
        )
        order by d.created_at
      )
      from public.fleet_metric_definitions d
      where d.business_id=p_business_id
    ),'[]'::jsonb),
    'assignments',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',a.id,
          'metric_definition_id',a.metric_definition_id,
          'business_id',a.business_id,
          'target_type',a.target_type,
          'target_id',a.target_id,
          'active',a.active,
          'created_at',a.created_at,
          'updated_at',a.updated_at
        )
        order by a.created_at
      )
      from public.fleet_metric_assignments a
      where a.business_id=p_business_id and a.active
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_fleet_metric_configuration(uuid) from public, anon;
grant execute on function public.get_fleet_metric_configuration(uuid) to authenticated, service_role;
