create or replace function public.get_location_recovery_confidence(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with cases as (
  select c.* from public.business_restroom_remediation_cases c
  join public.locations l on l.id=c.location_id and l.is_active=true
  where c.location_id=p_location_id and c.opened_at>=now()-interval '180 days'
), facts as (
  select count(*)::int issue_count,
    count(*) filter(where status='resolved')::int resolved_count,
    count(*) filter(where resolution_snapshot->>'community_confirmation_outcome'='confirmed')::int community_confirmed,
    count(*) filter(where resolution_snapshot->>'community_confirmation_outcome'='still_broken')::int failed_fixes,
    count(*) filter(where coalesce(escalation_level,0)>0)::int escalated,
    count(*) filter(where status in('open','assigned','in_progress'))::int active_count,
    count(distinct amenity_id)::int affected_amenities,max(resolved_at) latest_recovery_at
  from cases
)
select jsonb_build_object('location_id',p_location_id,'issue_count',issue_count,'resolved_count',resolved_count,'community_confirmed',community_confirmed,'failed_fixes',failed_fixes,'escalated',escalated,'active_count',active_count,'affected_amenities',affected_amenities,'latest_recovery_at',latest_recovery_at,
  'recovery_confidence_score',greatest(0,least(100,case when issue_count=0 then 100 else 55+least(25,community_confirmed*12)+least(15,resolved_count*4)-least(35,failed_fixes*20)-least(20,active_count*10)-least(15,escalated*5)-least(15,greatest(issue_count-affected_amenities,0)*4) end))::int,
  'recovery_state',case when issue_count=0 then 'no_recent_issues' when failed_fixes>0 then 'recovery_unstable' when active_count>0 then 'recovery_in_progress' when community_confirmed>0 then 'community_confirmed' when resolved_count>0 then 'business_reported_recovery' else 'needs_attention' end,'generated_at',now()) from facts;
$$;
revoke all on function public.get_location_recovery_confidence(uuid) from public;
grant execute on function public.get_location_recovery_confidence(uuid) to anon,authenticated,service_role;

create or replace function public.business_restroom_prevention_recommendations(p_business_id uuid,p_days integer default 90)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_days integer:=greatest(30,least(coalesce(p_days,90),365)); v_rows jsonb; v_summary jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 with cases as (select c.* from public.business_restroom_remediation_cases c where c.business_id=p_business_id and c.opened_at>=now()-make_interval(days=>v_days)), grouped as (
  select l.id location_id,l.name location_name,a.id amenity_id,a.name amenity_name,count(c.id)::int issue_count,greatest(count(c.id)-1,0)::int recurrence_count,
   count(c.id) filter(where c.status in('open','assigned','in_progress'))::int active_count,count(c.id) filter(where coalesce(c.escalation_level,0)>0)::int escalated_count,
   count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='confirmed')::int confirmed_fixes,
   count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='still_broken')::int failed_fixes,max(c.opened_at) latest_issue_at
  from public.locations l cross join public.amenities a left join cases c on c.location_id=l.id and c.amenity_id=a.id where l.business_id=p_business_id
  group by l.id,l.name,a.id,a.name having count(c.id)>0
 ), recommendations as (
  select *,case when failed_fixes>0 then 'root_cause_inspection' when recurrence_count>=3 then 'preventive_maintenance_plan' when escalated_count>0 then 'sla_process_review' when recurrence_count>=1 then 'increase_inspection_frequency' when confirmed_fixes=0 then 'request_community_confirmation' else 'monitor' end recommended_action,
   case when failed_fixes>0 or recurrence_count>=3 then 'critical' when escalated_count>0 or recurrence_count>=2 then 'high' when recurrence_count>=1 or confirmed_fixes=0 then 'watch' else 'stable' end prevention_priority,
   case when failed_fixes>0 then 12 when recurrence_count>=3 then 24 when recurrence_count>=2 then 48 when recurrence_count=1 then 72 else 168 end suggested_followup_hours from grouped
 )
 select jsonb_build_object('days',v_days,'tracked_pairs',count(*)::int,'critical_pairs',count(*) filter(where prevention_priority='critical')::int,'high_pairs',count(*) filter(where prevention_priority='high')::int,'followup_needed',count(*) filter(where recommended_action<>'monitor')::int),
  coalesce(jsonb_agg(to_jsonb(recommendations) order by case prevention_priority when 'critical' then 1 when 'high' then 2 when 'watch' then 3 else 4 end,failed_fixes desc,recurrence_count desc,latest_issue_at desc),'[]'::jsonb)
 into v_summary,v_rows from recommendations;
 return jsonb_build_object('business_id',p_business_id,'summary',coalesce(v_summary,'{}'::jsonb),'recommendations',coalesce(v_rows,'[]'::jsonb),'generated_at',now());
end; $$;
revoke all on function public.business_restroom_prevention_recommendations(uuid,integer) from public,anon;
grant execute on function public.business_restroom_prevention_recommendations(uuid,integer) to authenticated,service_role;

create or replace function public.fleet_restroom_prevention_portfolio(p_business_id uuid,p_days integer default 90)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_days integer:=greatest(30,least(coalesce(p_days,90),365)); v_rows jsonb; v_summary jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
 with cases as (select c.* from public.business_restroom_remediation_cases c where c.business_id=p_business_id and c.opened_at>=now()-make_interval(days=>v_days)), grouped as (
  select l.id location_id,l.name location_name,count(c.id)::int issue_count,greatest(count(c.id)-count(distinct c.amenity_id) filter(where c.id is not null),0)::int repeat_issue_count,
   count(c.id) filter(where c.status in('open','assigned','in_progress'))::int active_count,count(c.id) filter(where coalesce(c.escalation_level,0)>0)::int escalated_count,
   count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='still_broken')::int failed_fix_count,
   count(c.id) filter(where c.resolution_snapshot->>'community_confirmation_outcome'='confirmed')::int confirmed_fix_count,max(c.opened_at) latest_issue_at
  from public.locations l left join cases c on c.location_id=l.id where l.business_id=p_business_id group by l.id,l.name
 ), ranked as (
  select *,greatest(0,least(100,100-least(40,failed_fix_count*25)-least(30,repeat_issue_count*10)-least(20,active_count*8)-least(15,escalated_count*5)+least(10,confirmed_fix_count*3)))::int prevention_readiness_score,
   case when failed_fix_count>0 then 'root_cause_inspection' when repeat_issue_count>=3 then 'preventive_route' when escalated_count>0 then 'sla_review' when active_count>0 then 'active_response' when repeat_issue_count>0 then 'inspection_watch' else 'monitor' end recommended_action from grouped
 )
 select jsonb_build_object('days',v_days,'locations',count(*)::int,'root_cause_locations',count(*) filter(where recommended_action='root_cause_inspection')::int,'preventive_route_locations',count(*) filter(where recommended_action='preventive_route')::int,'average_prevention_readiness',round(avg(prevention_readiness_score)::numeric,1)),
  coalesce(jsonb_agg(to_jsonb(ranked) order by prevention_readiness_score asc,failed_fix_count desc,repeat_issue_count desc,latest_issue_at desc nulls last),'[]'::jsonb)
 into v_summary,v_rows from ranked;
 return jsonb_build_object('business_id',p_business_id,'summary',coalesce(v_summary,'{}'::jsonb),'locations',coalesce(v_rows,'[]'::jsonb),'generated_at',now());
end; $$;
revoke all on function public.fleet_restroom_prevention_portfolio(uuid,integer) from public,anon;
grant execute on function public.fleet_restroom_prevention_portfolio(uuid,integer) to authenticated,service_role;

create or replace function public.notify_business_restroom_remediation_opened()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_recent integer;
begin
 select count(*)::int into v_recent from public.business_restroom_remediation_cases c where c.business_id=new.business_id and c.location_id=new.location_id and c.amenity_id=new.amenity_id and c.id<>new.id and c.opened_at>=now()-interval '90 days';
 insert into public.notifications(user_id,type,title,body,data)
 select bm.user_id,case when v_recent>=2 then 'business_remediation_recurrence_escalated' else 'business_remediation_opened' end,
  case when v_recent>=2 then 'Recurring restroom issue needs prevention' else 'Restroom issue needs attention' end,
  coalesce(l.name,'A restroom')||' · '||coalesce(a.name,'Amenity')||case when v_recent>=2 then ' has repeated again and needs root-cause prevention.' else ' needs operational attention.' end,
  jsonb_build_object('business_id',new.business_id,'case_id',new.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'priority',new.priority,'recurrence_count',v_recent,
   'recommended_action',case when v_recent>=2 then 'root_cause_inspection' when v_recent=1 then 'increase_inspection_frequency' else 'standard_remediation' end,
   'destination','/location/'||new.location_id::text,'web_destination','/workspace/business?business='||new.business_id::text||'&focus=remediation&case='||new.id::text)
 from public.business_members bm join public.locations l on l.id=new.location_id join public.amenities a on a.id=new.amenity_id
 where bm.business_id=new.business_id and lower(bm.role::text) in ('owner','admin','manager');
 return new;
end $$;
revoke all on function public.notify_business_restroom_remediation_opened() from public,anon,authenticated;
grant execute on function public.notify_business_restroom_remediation_opened() to service_role;
