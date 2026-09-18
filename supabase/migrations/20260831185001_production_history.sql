create or replace function public.business_restroom_remediation_performance(p_business_id uuid,p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_days integer:=greatest(1,least(coalesce(p_days,30),365)); v_summary jsonb; v_locations jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  with cases as (
    select c.*,extract(epoch from (c.resolved_at-c.opened_at))/60.0 resolution_minutes
    from public.business_restroom_remediation_cases c
    where c.business_id=p_business_id and c.opened_at>=now()-make_interval(days=>v_days)
  )
  select jsonb_build_object(
    'days',v_days,'opened',count(*)::int,
    'active',count(*) filter(where status in('open','assigned','in_progress'))::int,
    'resolved',count(*) filter(where status='resolved')::int,
    'dismissed',count(*) filter(where status='dismissed')::int,
    'escalated',count(*) filter(where coalesce(escalation_level,0)>0)::int,
    'critical_escalations',count(*) filter(where coalesce(escalation_level,0)>=2)::int,
    'proof_backed_resolutions',count(*) filter(where status='resolved' and resolution_media_id is not null)::int,
    'sla_met_resolutions',count(*) filter(where status='resolved' and coalesce((resolution_snapshot->>'sla_met')::boolean,false))::int,
    'sla_met_pct',case when count(*) filter(where status='resolved')=0 then null else round(100.0*(count(*) filter(where status='resolved' and coalesce((resolution_snapshot->>'sla_met')::boolean,false)))::numeric/(count(*) filter(where status='resolved'))::numeric,1) end,
    'proof_rate_pct',case when count(*) filter(where status='resolved')=0 then null else round(100.0*(count(*) filter(where status='resolved' and resolution_media_id is not null))::numeric/(count(*) filter(where status='resolved'))::numeric,1) end,
    'median_resolution_minutes',round((percentile_cont(0.5) within group(order by resolution_minutes) filter(where status='resolved' and resolution_minutes is not null))::numeric,1),
    'average_resolution_minutes',round((avg(resolution_minutes) filter(where status='resolved'))::numeric,1)
  ) into v_summary from cases;
  with cases as (
    select c.*,extract(epoch from (c.resolved_at-c.opened_at))/60.0 resolution_minutes
    from public.business_restroom_remediation_cases c
    where c.business_id=p_business_id and c.opened_at>=now()-make_interval(days=>v_days)
  ), grouped as (
    select l.id location_id,l.name location_name,count(c.id)::int opened,
      count(c.id) filter(where c.status in('open','assigned','in_progress'))::int active,
      count(c.id) filter(where c.status='resolved')::int resolved,
      count(c.id) filter(where coalesce(c.escalation_level,0)>0)::int escalated,
      count(c.id) filter(where c.status='resolved' and c.resolution_media_id is not null)::int proof_backed,
      case when count(c.id) filter(where c.status='resolved')=0 then null else round(100.0*(count(c.id) filter(where c.status='resolved' and coalesce((c.resolution_snapshot->>'sla_met')::boolean,false)))::numeric/(count(c.id) filter(where c.status='resolved'))::numeric,1) end sla_met_pct,
      round((avg(c.resolution_minutes) filter(where c.status='resolved'))::numeric,1) average_resolution_minutes
    from public.locations l left join cases c on c.location_id=l.id
    where l.business_id=p_business_id group by l.id,l.name
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by active desc,opened desc,location_name),'[]'::jsonb) into v_locations from grouped;
  return jsonb_build_object('business_id',p_business_id,'summary',coalesce(v_summary,'{}'::jsonb),'locations',v_locations,'generated_at',now());
end;
$$;
revoke all on function public.business_restroom_remediation_performance(uuid,integer) from public,anon;
grant execute on function public.business_restroom_remediation_performance(uuid,integer) to authenticated,service_role;
