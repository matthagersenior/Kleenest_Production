insert into public.progression_actions(code,label,points,enabled)
values('remediation_confirmation','Verify a business restroom fix',12,true)
on conflict (code) do update set label=excluded.label,points=excluded.points,enabled=true;

create or replace function public.get_location_remediation_confirmation_opportunities(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with uid as (select auth.uid() user_id), candidates as (
  select c.id case_id,c.business_id,c.location_id,c.amenity_id,a.name amenity_name,c.priority,c.resolved_at,c.resolution_media_id,
         lp.storage_path proof_storage_path,
         exists(select 1 from public.location_amenity_observations o,uid where uid.user_id is not null and o.user_id=uid.user_id and o.metadata->>'confirmation_case_id'=c.id::text) already_confirmed_by_you,
         exists(select 1 from public.check_ins ci,uid where uid.user_id is not null and ci.user_id=uid.user_id and ci.location_id=c.location_id and ci.checked_in_at>c.resolved_at and ci.checked_in_at>=now()-interval '24 hours') verified_visit_ready
  from public.business_restroom_remediation_cases c
  join public.locations l on l.id=c.location_id and l.is_active=true
  join public.amenities a on a.id=c.amenity_id
  left join public.location_photos lp on lp.id=c.resolution_media_id
  where c.location_id=p_location_id and c.status='resolved' and c.resolution_observation_id is not null
    and c.resolved_at>=now()-interval '30 days'
    and exists(select 1 from public.location_amenity_observations ro where ro.id=c.resolution_observation_id and ro.verification_method='business_remediation')
    and not exists(select 1 from public.location_amenity_observations o where o.metadata->>'confirmation_case_id'=c.id::text and o.status='absent' and o.observed_at>c.resolved_at)
  order by c.resolved_at desc
  limit 12
)
select coalesce(jsonb_agg(jsonb_build_object(
  'case_id',case_id,'business_id',business_id,'location_id',location_id,'amenity_id',amenity_id,'amenity_name',amenity_name,
  'priority',priority,'resolved_at',resolved_at,'proof_available',resolution_media_id is not null,'proof_storage_path',proof_storage_path,
  'already_confirmed_by_you',already_confirmed_by_you,'verified_visit_ready',verified_visit_ready,'requires_verified_visit',true
) order by resolved_at desc),'[]'::jsonb) from candidates;
$$;
revoke all on function public.get_location_remediation_confirmation_opportunities(uuid) from public;
grant execute on function public.get_location_remediation_confirmation_opportunities(uuid) to anon,authenticated,service_role;

create or replace function public.confirm_business_remediation(p_case_id uuid,p_outcome text,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  c public.business_restroom_remediation_cases;
  v_check_in uuid;
  v_observation uuid;
  v_progression jsonb;
  v_reopened uuid;
  v_status text;
  v_sentiment text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_outcome not in ('confirmed','still_broken') then raise exception 'Outcome must be confirmed or still_broken'; end if;
  select * into c from public.business_restroom_remediation_cases where id=p_case_id and status='resolved' for update;
  if c.id is null then raise exception 'Resolved remediation case not found'; end if;
  if c.resolution_observation_id is null or not exists(select 1 from public.location_amenity_observations ro where ro.id=c.resolution_observation_id and ro.verification_method='business_remediation') then raise exception 'Only business-remediation fixes can be community confirmed'; end if;
  if c.resolved_at<now()-interval '30 days' then raise exception 'This remediation confirmation window has expired'; end if;
  if exists(select 1 from public.business_members bm where bm.business_id=c.business_id and bm.user_id=uid) then raise exception 'Business members cannot confirm their own remediation'; end if;
  if exists(select 1 from public.location_amenity_observations o where o.user_id=uid and o.metadata->>'confirmation_case_id'=c.id::text) then raise exception 'You already confirmed this remediation'; end if;

  select ci.id into v_check_in
  from public.check_ins ci
  where ci.user_id=uid and ci.location_id=c.location_id and ci.checked_in_at>c.resolved_at and ci.checked_in_at>=now()-interval '24 hours'
  order by ci.checked_in_at desc limit 1;
  if v_check_in is null then raise exception 'A verified check-in after the business fix is required'; end if;

  v_status:=case when p_outcome='confirmed' then 'present' else 'absent' end;
  v_sentiment:=case when p_outcome='confirmed' then 'community_confirmed_fix' else 'needs_attention' end;
  insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,confidence,verification_method,check_in_id,notes,observed_at,metadata)
  values(c.location_id,uid,c.amenity_id,v_status,0.95,'community_fix_confirmation',v_check_in,nullif(trim(coalesce(p_notes,'')),''),now(),
    jsonb_build_object('source','community_fix_confirmation','confirmation_case_id',c.id,'business_id',c.business_id,'outcome',p_outcome,'sentiment',v_sentiment,'server_authoritative',true))
  returning id into v_observation;

  update public.business_restroom_remediation_cases
  set resolution_snapshot=coalesce(resolution_snapshot,'{}'::jsonb)||jsonb_build_object(
    'community_confirmation_outcome',p_outcome,'community_confirmation_at',now(),'community_confirmation_observation_id',v_observation),updated_at=now()
  where id=c.id;

  begin
    v_progression:=public.record_progression_action('remediation_confirmation',c.id);
  exception when others then
    v_progression:=jsonb_build_object('awarded',false,'reason','progression_unavailable');
  end;

  if p_outcome='still_broken' then
    select rc.id into v_reopened from public.business_restroom_remediation_cases rc
    where rc.business_id=c.business_id and rc.location_id=c.location_id and rc.amenity_id=c.amenity_id and rc.status in('open','assigned','in_progress')
    order by rc.opened_at desc limit 1;
  end if;

  insert into public.notifications(user_id,type,title,body,data)
  select distinct bm.user_id,
    case when p_outcome='confirmed' then 'business_remediation_community_confirmed' else 'business_remediation_recurrence' end,
    case when p_outcome='confirmed' then 'Community verified your restroom fix' else 'Restroom issue reported again after remediation' end,
    coalesce(l.name,'A restroom')||' · '||coalesce(a.name,'Amenity')||case when p_outcome='confirmed' then ' was verified by a recent visitor.' else ' is still reported as needing attention.' end,
    jsonb_build_object('business_id',c.business_id,'case_id',coalesce(v_reopened,c.id),'prior_case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'confirmation_observation_id',v_observation,'outcome',p_outcome,
      'destination','/location/'||c.location_id::text,'web_destination','/workspace/business?business='||c.business_id::text||'&focus=remediation&case='||coalesce(v_reopened,c.id)::text)
  from public.business_members bm join public.locations l on l.id=c.location_id join public.amenities a on a.id=c.amenity_id
  where bm.business_id=c.business_id and lower(bm.role::text) in('owner','admin','manager');

  return jsonb_build_object('case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'outcome',p_outcome,'observation_id',v_observation,'check_in_id',v_check_in,'reopened_case_id',v_reopened,'progression',v_progression,'confirmed_at',now());
end;
$$;
revoke all on function public.confirm_business_remediation(uuid,text,text) from public,anon;
grant execute on function public.confirm_business_remediation(uuid,text,text) to authenticated,service_role;

create or replace function public.business_restroom_reliability(p_business_id uuid,p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_days integer:=greatest(30,least(coalesce(p_days,90),365)); v_summary jsonb; v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  with cases as (
    select c.* from public.business_restroom_remediation_cases c where c.business_id=p_business_id and c.opened_at>=now()-make_interval(days=>v_days)
  ), grouped as (
    select l.id location_id,l.name location_name,a.id amenity_id,a.name amenity_name,
      count(c.id)::int issue_count,
      greatest(count(c.id)-1,0)::int recurrence_count,
      count(c.id) filter(where c.status='resolved')::int resolved_count,
      count(c.id) filter(where coalesce(c.escalation_level,0)>0)::int escalated_count,
      count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='confirmed')::int community_confirmed_fixes,
      count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='still_broken')::int failed_fixes,
      max(c.opened_at) latest_issue_at
    from public.locations l cross join public.amenities a left join cases c on c.location_id=l.id and c.amenity_id=a.id
    where l.business_id=p_business_id
    group by l.id,l.name,a.id,a.name
    having count(c.id)>0
  ), scored as (
    select *,greatest(0,least(100,100-least(60,recurrence_count*20)-least(20,failed_fixes*20)-least(20,escalated_count*5)))::int reliability_score,
      case when failed_fixes>0 or recurrence_count>=3 then 'critical' when recurrence_count>=2 then 'high' when recurrence_count=1 then 'watch' else 'stable' end reliability_state
    from grouped
  )
  select jsonb_build_object(
    'days',v_days,'tracked_amenity_pairs',count(*)::int,'recurring_pairs',count(*) filter(where recurrence_count>0)::int,
    'failed_fix_pairs',count(*) filter(where failed_fixes>0)::int,'critical_pairs',count(*) filter(where reliability_state='critical')::int,
    'average_reliability_score',round(avg(reliability_score)::numeric,1)
  ),coalesce(jsonb_agg(to_jsonb(scored) order by reliability_score asc,recurrence_count desc,latest_issue_at desc),'[]'::jsonb)
  into v_summary,v_rows from scored;
  return jsonb_build_object('business_id',p_business_id,'summary',coalesce(v_summary,'{}'::jsonb),'issues',coalesce(v_rows,'[]'::jsonb),'generated_at',now());
end;
$$;
revoke all on function public.business_restroom_reliability(uuid,integer) from public,anon;
grant execute on function public.business_restroom_reliability(uuid,integer) to authenticated,service_role;

create or replace function public.fleet_restroom_remediation_risk(p_business_id uuid,p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_days integer:=greatest(30,least(coalesce(p_days,90),365)); v_rows jsonb; v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
  with cases as (
    select c.* from public.business_restroom_remediation_cases c where c.business_id=p_business_id and c.opened_at>=now()-make_interval(days=>v_days)
  ), by_location as (
    select l.id location_id,l.name location_name,
      count(c.id)::int issue_count,
      count(c.id) filter(where c.status in('open','assigned','in_progress'))::int active_count,
      count(c.id) filter(where coalesce(c.escalation_level,0)>0)::int escalated_count,
      count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='still_broken')::int failed_fix_count,
      count(distinct c.amenity_id) filter(where c.id is not null)::int affected_amenities,
      max(c.opened_at) latest_issue_at,
      greatest(0,least(100,
        100-least(35,(count(c.id) filter(where c.status in('open','assigned','in_progress')))*12)
           -least(25,(count(c.id) filter(where coalesce(c.escalation_level,0)>0))*8)
           -least(30,(count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='still_broken'))*20)
           -least(20,greatest(count(c.id)-count(distinct c.amenity_id) filter(where c.id is not null),0)*5)
      ))::int operational_reliability_score
    from public.locations l left join cases c on c.location_id=l.id
    where l.business_id=p_business_id
    group by l.id,l.name
  ), ranked as (
    select *,case when operational_reliability_score<50 or failed_fix_count>0 then 'critical' when operational_reliability_score<70 or escalated_count>0 then 'high' when active_count>0 or issue_count>1 then 'watch' else 'stable' end risk_state
    from by_location
  )
  select jsonb_build_object(
    'days',v_days,'locations',count(*)::int,'locations_with_active_work',count(*) filter(where active_count>0)::int,
    'critical_locations',count(*) filter(where risk_state='critical')::int,'high_risk_locations',count(*) filter(where risk_state='high')::int,
    'failed_fix_locations',count(*) filter(where failed_fix_count>0)::int,'average_operational_reliability',round(avg(operational_reliability_score)::numeric,1)
  ),coalesce(jsonb_agg(to_jsonb(ranked) order by operational_reliability_score asc,active_count desc,latest_issue_at desc nulls last),'[]'::jsonb)
  into v_summary,v_rows from ranked;
  return jsonb_build_object('business_id',p_business_id,'summary',coalesce(v_summary,'{}'::jsonb),'locations',coalesce(v_rows,'[]'::jsonb),'generated_at',now());
end;
$$;
revoke all on function public.fleet_restroom_remediation_risk(uuid,integer) from public,anon;
grant execute on function public.fleet_restroom_remediation_risk(uuid,integer) to authenticated,service_role;
