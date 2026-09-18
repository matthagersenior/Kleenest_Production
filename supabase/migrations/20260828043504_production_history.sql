create or replace function public.get_fleet_metric_configuration(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
  select jsonb_build_object(
    'business_id',p_business_id,
    'definitions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.fleet_metric_definitions d where d.business_id=p_business_id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.fleet_metric_assignments a where a.business_id=p_business_id and a.active),'[]'::jsonb)
  )
  where public.fleet_observe_access(p_business_id);
$$;

create or replace function public.get_fleet_metric_values(p_business_id uuid,p_as_of date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare d record; result jsonb:='[]'::jsonb; start_date date; v numeric; score numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
  for d in select * from public.fleet_metric_definitions where business_id=p_business_id and active loop
    start_date:=case d.period when 'day' then p_as_of when 'week' then p_as_of-6 when 'month' then p_as_of-29 when 'quarter' then p_as_of-89 else p_as_of-6 end; v:=null;
    if d.source_dataset='fleet_metric_snapshots' then execute format('select %s(%I) from public.fleet_metric_snapshots where business_id=$1 and snapshot_date between $2 and $3',d.aggregation,d.source_metric) into v using p_business_id,start_date,p_as_of;
    elsif d.source_dataset='fleet_driver_scorecards' then execute format('select %s(%I) from public.fleet_driver_scorecards where business_id=$1 and score_date between $2 and $3',d.aggregation,d.source_metric) into v using p_business_id,start_date,p_as_of;
    elsif d.source_dataset='fleet_vehicle_daily_metrics' then execute format('select %s(%I) from public.fleet_vehicle_daily_metrics where business_id=$1 and metric_date between $2 and $3',d.aggregation,d.source_metric) into v using p_business_id,start_date,p_as_of; end if;
    if v is not null then score:=case when d.scoring_method in ('binary','threshold') and ((d.direction='higher_is_better' and v>=coalesce(d.threshold,d.goal)) or (d.direction='lower_is_better' and v<=coalesce(d.threshold,d.goal))) then d.max_score when d.scoring_method='linear' and d.goal is not null then greatest(0,least(d.max_score,case when d.direction='higher_is_better' then d.max_score*v/d.goal else d.max_score*d.goal/nullif(v,0) end)) else null end; end if;
    result:=result||jsonb_build_array(jsonb_build_object('definition_id',d.id,'metric_key',d.metric_key,'name',d.name,'source_dataset',d.source_dataset,'source_metric',d.source_metric,'period',d.period,'value',v,'score',score,'goal',d.goal,'threshold',d.threshold,'direction',d.direction,'max_score',d.max_score));
  end loop; return result;
end;
$$;
