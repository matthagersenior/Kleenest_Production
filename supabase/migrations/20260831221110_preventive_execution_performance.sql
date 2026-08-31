create or replace function public.business_restroom_preventive_execution_performance(p_business_id uuid,p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  v_days integer:=greatest(30,least(coalesce(p_days,90),365));
  v_summary jsonb;
  v_locations jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=uid) then raise exception 'Business membership required'; end if;
  with base as (
    select w.*,l.name location_name,
      case when w.started_at is not null then extract(epoch from (w.started_at-w.created_at))/3600.0 end start_hours,
      case when w.completed_at is not null then extract(epoch from (w.completed_at-w.created_at))/3600.0 end completion_hours,
      case when w.completed_at is not null and w.due_at is not null then w.completed_at<=w.due_at end completed_before_due
    from public.business_restroom_preventive_work_orders w
    join public.locations l on l.id=w.location_id
    where w.business_id=p_business_id and w.created_at>=now()-make_interval(days=>v_days)
  ), agg as (
    select count(*)::int created,
      count(*) filter(where status='completed')::int completed,
      count(*) filter(where status='dismissed')::int dismissed,
      count(*) filter(where status in('planned','assigned','in_progress'))::int active,
      count(*) filter(where coalesce(escalation_level,0)>=1)::int escalated,
      count(*) filter(where coalesce(escalation_level,0)>=2)::int critical_escalated,
      count(*) filter(where status='completed' and proof_media_id is not null)::int proof_backed,
      count(*) filter(where status='completed' and completed_before_due)::int completed_before_due_count,
      count(*) filter(where status='completed' and completed_before_due=false)::int completed_late_count,
      round(avg(start_hours)::numeric,1) average_start_hours,
      round(avg(completion_hours) filter(where status='completed')::numeric,1) average_completion_hours,
      round(percentile_cont(0.5) within group(order by completion_hours) filter(where status='completed')::numeric,1) median_completion_hours
    from base
  )
  select jsonb_build_object(
    'created',created,'completed',completed,'dismissed',dismissed,'active',active,
    'escalated',escalated,'critical_escalated',critical_escalated,'proof_backed',proof_backed,
    'completed_before_due',completed_before_due_count,'completed_late',completed_late_count,
    'completion_rate_pct',case when created>0 then round(100.0*completed/created,1) else 0 end,
    'on_time_completion_pct',case when completed>0 then round(100.0*completed_before_due_count/completed,1) else 0 end,
    'escalation_rate_pct',case when created>0 then round(100.0*escalated/created,1) else 0 end,
    'proof_rate_pct',case when completed>0 then round(100.0*proof_backed/completed,1) else 0 end,
    'average_start_hours',average_start_hours,'average_completion_hours',average_completion_hours,'median_completion_hours',median_completion_hours
  ) into v_summary from agg;
  with base as (
    select w.*,l.name location_name,
      case when w.completed_at is not null and w.due_at is not null then w.completed_at<=w.due_at end completed_before_due,
      case when w.completed_at is not null then extract(epoch from (w.completed_at-w.created_at))/3600.0 end completion_hours
    from public.business_restroom_preventive_work_orders w
    join public.locations l on l.id=w.location_id
    where w.business_id=p_business_id and w.created_at>=now()-make_interval(days=>v_days)
  ), grouped as (
    select location_id,max(location_name) location_name,count(*)::int created,
      count(*) filter(where status='completed')::int completed,
      count(*) filter(where coalesce(escalation_level,0)>=1)::int escalated,
      count(*) filter(where status='completed' and proof_media_id is not null)::int proof_backed,
      count(*) filter(where status='completed' and completed_before_due)::int completed_before_due_count,
      round(avg(completion_hours) filter(where status='completed')::numeric,1) average_completion_hours
    from base group by location_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'location_id',location_id,'location_name',location_name,'created',created,'completed',completed,'escalated',escalated,
    'proof_backed',proof_backed,
    'on_time_completion_pct',case when completed>0 then round(100.0*completed_before_due_count/completed,1) else 0 end,
    'average_completion_hours',average_completion_hours
  ) order by escalated desc,created desc,location_name),'[]'::jsonb) into v_locations from grouped;
  return jsonb_build_object('business_id',p_business_id,'window_days',v_days,'summary',coalesce(v_summary,'{}'::jsonb),'locations',coalesce(v_locations,'[]'::jsonb),'generated_at',now());
end $$;
revoke all on function public.business_restroom_preventive_execution_performance(uuid,integer) from public,anon;
grant execute on function public.business_restroom_preventive_execution_performance(uuid,integer) to authenticated,service_role;
