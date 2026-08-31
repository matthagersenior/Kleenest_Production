create or replace function public.materialize_restroom_preventive_work_orders(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_days integer:=greatest(30,least(coalesce(p_days,90),365)); v_inserted integer:=0; v_considered integer:=0;
begin
  with cases as (
    select c.* from public.business_restroom_remediation_cases c where c.opened_at>=now()-make_interval(days=>v_days)
  ), grouped as (
    select l.business_id,l.id location_id,a.id amenity_id,
      count(c.id)::int issue_count,
      greatest(count(c.id)-1,0)::int recurrence_count,
      count(c.id) filter(where c.status in('open','assigned','in_progress'))::int active_count,
      count(c.id) filter(where coalesce(c.escalation_level,0)>0)::int escalated_count,
      count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='confirmed')::int confirmed_fixes,
      count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='still_broken')::int failed_fixes,
      max(c.opened_at) latest_issue_at
    from public.locations l cross join public.amenities a
    left join cases c on c.location_id=l.id and c.amenity_id=a.id and c.business_id=l.business_id
    where l.business_id is not null
    group by l.business_id,l.id,a.id
    having count(c.id)>0
  ), recommendations as (
    select *,
      case when failed_fixes>0 then 'root_cause_inspection' when recurrence_count>=3 then 'preventive_maintenance_plan' when escalated_count>0 then 'sla_process_review' when recurrence_count>=1 then 'increase_inspection_frequency' when confirmed_fixes=0 then 'request_community_confirmation' else 'monitor' end recommended_action,
      case when failed_fixes>0 or recurrence_count>=3 then 'critical' when escalated_count>0 or recurrence_count>=2 then 'high' when recurrence_count>=1 or confirmed_fixes=0 then 'watch' else 'stable' end prevention_priority,
      case when failed_fixes>0 then 12 when recurrence_count>=3 then 24 when recurrence_count>=2 then 48 when recurrence_count=1 then 72 else 168 end suggested_followup_hours
    from grouped
  ), candidates as (
    select *,jsonb_build_object('location_id',location_id,'amenity_id',amenity_id,'issue_count',issue_count,'recurrence_count',recurrence_count,'active_count',active_count,'escalated_count',escalated_count,'confirmed_fixes',confirmed_fixes,'failed_fixes',failed_fixes,'latest_issue_at',latest_issue_at,'recommended_action',recommended_action,'priority',prevention_priority,'suggested_followup_hours',suggested_followup_hours,'source','automatic_preventive_materializer','server_authoritative',true) snapshot
    from recommendations where recommended_action<>'monitor'
  ), ins as (
    insert into public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id,recommendation_action,priority,source_snapshot,due_at)
    select business_id,location_id,amenity_id,recommended_action,prevention_priority,snapshot,now()+make_interval(hours=>suggested_followup_hours)
    from candidates on conflict do nothing returning id
  )
  select (select count(*) from candidates)::int,(select count(*) from ins)::int into v_considered,v_inserted;
  return jsonb_build_object('days',v_days,'considered',v_considered,'inserted',v_inserted,'processed_at',now());
end;
$$;
revoke all on function public.materialize_restroom_preventive_work_orders(integer) from public,anon,authenticated;
grant execute on function public.materialize_restroom_preventive_work_orders(integer) to service_role;

do $$ declare j record; begin
  for j in select jobid from cron.job where jobname='kleenest-preventive-work-materializer' loop perform cron.unschedule(j.jobid); end loop;
  perform cron.schedule('kleenest-preventive-work-materializer','0 * * * *','select public.materialize_restroom_preventive_work_orders(90);');
end $$;
