alter table public.business_restroom_preventive_work_orders
  add column if not exists verification_status text,
  add column if not exists verification_outcome text,
  add column if not exists verification_observation_id uuid references public.location_amenity_observations(id) on delete set null,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists followup_work_order_id uuid references public.business_restroom_preventive_work_orders(id) on delete set null;

alter table public.business_restroom_preventive_work_orders
  drop constraint if exists business_restroom_preventive_work_orders_verification_status_check;
alter table public.business_restroom_preventive_work_orders
  add constraint business_restroom_preventive_work_orders_verification_status_check
  check (verification_status is null or verification_status in ('pending','effective','failed'));
alter table public.business_restroom_preventive_work_orders
  drop constraint if exists business_restroom_preventive_work_orders_verification_outcome_check;
alter table public.business_restroom_preventive_work_orders
  add constraint business_restroom_preventive_work_orders_verification_outcome_check
  check (verification_outcome is null or verification_outcome in ('effective','issue_present'));

create index if not exists ix_restroom_preventive_verification
  on public.business_restroom_preventive_work_orders(location_id,verification_status,completed_at desc)
  where status='completed';

insert into public.progression_actions(code,label,points,enabled)
values('preventive_confirmation','Verify preventive restroom maintenance',10,true)
on conflict (code) do update set label=excluded.label,points=excluded.points,enabled=true;

create or replace function public.business_manage_restroom_preventive_work_order(
  p_business_id uuid,p_work_order_id uuid,p_action text,p_assigned_to uuid default null,p_notes text default null,p_proof_media_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w public.business_restroom_preventive_work_orders; act text:=lower(trim(coalesce(p_action,'')));
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 select * into w from public.business_restroom_preventive_work_orders where id=p_work_order_id and business_id=p_business_id for update;
 if not found then raise exception 'Preventive work order not found'; end if;
 if act='assign' then
   if p_assigned_to is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_assigned_to) then raise exception 'Valid business team member required'; end if;
   update public.business_restroom_preventive_work_orders set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),updated_at=now() where id=w.id;
 elsif act='claim' then
   update public.business_restroom_preventive_work_orders set status='assigned',assigned_to=uid,assigned_at=now(),updated_at=now() where id=w.id;
 elsif act='start' then
   update public.business_restroom_preventive_work_orders set status='in_progress',assigned_to=coalesce(assigned_to,uid),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where id=w.id;
 elsif act='complete' then
   if length(trim(coalesce(p_notes,'')))<3 then raise exception 'Completion notes are required'; end if;
   update public.business_restroom_preventive_work_orders
   set status='completed',completion_notes=p_notes,proof_media_id=p_proof_media_id,completed_at=now(),verification_status='pending',verification_outcome=null,verification_observation_id=null,verified_by=null,verified_at=null,followup_work_order_id=null,updated_at=now()
   where id=w.id;
 elsif act='dismiss' then
   update public.business_restroom_preventive_work_orders set status='dismissed',completion_notes=p_notes,dismissed_at=now(),updated_at=now() where id=w.id;
 elsif act='reopen' then
   update public.business_restroom_preventive_work_orders
   set status='planned',assigned_to=null,assigned_at=null,started_at=null,completed_at=null,dismissed_at=null,completion_notes=null,verification_status=null,verification_outcome=null,verification_observation_id=null,verified_by=null,verified_at=null,followup_work_order_id=null,updated_at=now()
   where id=w.id;
 else raise exception 'Unsupported preventive work-order action'; end if;
 select * into w from public.business_restroom_preventive_work_orders where id=p_work_order_id;
 return to_jsonb(w);
end $$;

create or replace function public.get_location_preventive_verification_opportunities(p_location_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
with uid as (select auth.uid() user_id), candidates as (
 select w.id work_order_id,w.business_id,w.location_id,w.amenity_id,a.name amenity_name,w.priority,w.recommendation_action,w.completed_at,w.completion_notes,w.proof_media_id,
        lp.storage_path proof_storage_path,w.verification_status,w.verification_outcome,
        exists(select 1 from public.location_amenity_observations o,uid where uid.user_id is not null and o.user_id=uid.user_id and o.metadata->>'preventive_work_order_id'=w.id::text) already_verified_by_you,
        exists(select 1 from public.check_ins ci,uid where uid.user_id is not null and ci.user_id=uid.user_id and ci.location_id=w.location_id and ci.checked_in_at>w.completed_at and ci.checked_in_at>=now()-interval '24 hours') verified_visit_ready,
        exists(select 1 from public.business_members bm,uid where uid.user_id is not null and bm.business_id=w.business_id and bm.user_id=uid.user_id) business_member
 from public.business_restroom_preventive_work_orders w
 join public.locations l on l.id=w.location_id and l.is_active=true
 join public.amenities a on a.id=w.amenity_id
 left join public.location_photos lp on lp.id=w.proof_media_id
 where w.location_id=p_location_id and w.status='completed' and w.verification_status='pending'
   and w.completed_at>=now()-interval '30 days'
 order by w.completed_at desc limit 12
)
select coalesce(jsonb_agg(jsonb_build_object(
 'work_order_id',work_order_id,'business_id',business_id,'location_id',location_id,'amenity_id',amenity_id,'amenity_name',amenity_name,
 'priority',priority,'recommendation_action',recommendation_action,'completed_at',completed_at,'completion_notes',completion_notes,
 'proof_available',proof_media_id is not null,'proof_storage_path',proof_storage_path,'verification_status',verification_status,
 'already_verified_by_you',already_verified_by_you,'verified_visit_ready',verified_visit_ready,'requires_verified_visit',true,
 'eligible_to_verify',not business_member and not already_verified_by_you
) order by completed_at desc),'[]'::jsonb) from candidates;
$$;

create or replace function public.confirm_preventive_work_order(p_work_order_id uuid,p_outcome text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); w public.business_restroom_preventive_work_orders; v_check_in uuid; v_observation uuid; v_progression jsonb; v_followup uuid; v_status text;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_outcome not in ('effective','issue_present') then raise exception 'Outcome must be effective or issue_present'; end if;
 select * into w from public.business_restroom_preventive_work_orders where id=p_work_order_id and status='completed' for update;
 if w.id is null then raise exception 'Completed preventive work order not found'; end if;
 if w.verification_status<>'pending' then raise exception 'This preventive work order has already been independently verified'; end if;
 if w.completed_at<now()-interval '30 days' then raise exception 'This preventive verification window has expired'; end if;
 if exists(select 1 from public.business_members bm where bm.business_id=w.business_id and bm.user_id=uid) then raise exception 'Business members cannot verify their own preventive maintenance'; end if;
 if exists(select 1 from public.location_amenity_observations o where o.user_id=uid and o.metadata->>'preventive_work_order_id'=w.id::text) then raise exception 'You already verified this preventive maintenance'; end if;
 select ci.id into v_check_in from public.check_ins ci where ci.user_id=uid and ci.location_id=w.location_id and ci.checked_in_at>w.completed_at and ci.checked_in_at>=now()-interval '24 hours' order by ci.checked_in_at desc limit 1;
 if v_check_in is null then raise exception 'A verified check-in after the preventive maintenance is required'; end if;
 v_status:=case when p_outcome='effective' then 'present' else 'absent' end;
 insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,confidence,verification_method,check_in_id,notes,observed_at,metadata)
 values(w.location_id,uid,w.amenity_id,v_status,0.95,'community_preventive_confirmation',v_check_in,nullif(trim(coalesce(p_notes,'')),''),now(),jsonb_build_object('source','community_preventive_confirmation','preventive_work_order_id',w.id,'business_id',w.business_id,'outcome',p_outcome,'server_authoritative',true))
 returning id into v_observation;

 if p_outcome='issue_present' then
   insert into public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id,recommendation_action,priority,status,source_snapshot,due_at)
   values(w.business_id,w.location_id,w.amenity_id,'post_maintenance_issue_followup',case when w.priority='critical' then 'critical' else 'high' end,'planned',jsonb_build_object('source','failed_preventive_verification','prior_work_order_id',w.id,'verification_observation_id',v_observation,'prior_snapshot',w.source_snapshot),now()+interval '24 hours')
   on conflict do nothing;
   select id into v_followup from public.business_restroom_preventive_work_orders
   where business_id=w.business_id and location_id=w.location_id and amenity_id=w.amenity_id and status in('planned','assigned','in_progress')
   order by created_at desc limit 1;
 end if;

 update public.business_restroom_preventive_work_orders
 set verification_status=case when p_outcome='effective' then 'effective' else 'failed' end,
     verification_outcome=p_outcome,verification_observation_id=v_observation,verified_by=uid,verified_at=now(),followup_work_order_id=v_followup,updated_at=now()
 where id=w.id;

 begin v_progression:=public.record_progression_action('preventive_confirmation',w.id); exception when others then v_progression:=jsonb_build_object('awarded',false,'reason','progression_unavailable'); end;

 insert into public.notifications(user_id,type,title,body,data)
 select distinct bm.user_id,
   case when p_outcome='effective' then 'preventive_maintenance_verified' else 'preventive_maintenance_failed_verification' end,
   case when p_outcome='effective' then 'Preventive restroom work independently verified' else 'Preventive restroom work needs follow-up' end,
   coalesce(l.name,'A restroom')||' · '||coalesce(a.name,'Amenity')||case when p_outcome='effective' then ' was verified by a recent visitor after preventive work.' else ' is still reported as needing attention after preventive work.' end,
   jsonb_build_object('business_id',w.business_id,'work_order_id',w.id,'followup_work_order_id',v_followup,'location_id',w.location_id,'amenity_id',w.amenity_id,'verification_observation_id',v_observation,'outcome',p_outcome,'destination','/location/'||w.location_id::text,'web_destination','/workspace/business?business='||w.business_id::text||'&focus=prevention&work='||coalesce(v_followup,w.id)::text)
 from public.business_members bm join public.locations l on l.id=w.location_id join public.amenities a on a.id=w.amenity_id
 where bm.business_id=w.business_id and lower(bm.role::text) in('owner','admin','manager');

 return jsonb_build_object('work_order_id',w.id,'location_id',w.location_id,'amenity_id',w.amenity_id,'outcome',p_outcome,'verification_status',case when p_outcome='effective' then 'effective' else 'failed' end,'observation_id',v_observation,'check_in_id',v_check_in,'followup_work_order_id',v_followup,'progression',v_progression,'verified_at',now());
end $$;

create or replace function public.get_location_preventive_maintenance_status(p_location_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
with w as(select * from public.business_restroom_preventive_work_orders where location_id=p_location_id), agg as(
 select count(*) filter(where status in('planned','assigned','in_progress'))::int active,
        count(*) filter(where status='completed')::int completed,
        count(*) filter(where status='completed' and verification_status='pending')::int awaiting_verification,
        count(*) filter(where status='completed' and verification_status='effective')::int verified_effective,
        count(*) filter(where status='completed' and verification_status='failed')::int failed_verification,
        max(completed_at) filter(where status='completed') latest_completed_at,max(verified_at) latest_verified_at,max(created_at) latest_created_at from w)
select jsonb_build_object('location_id',p_location_id,'active_preventive_work',agg.active,'completed_preventive_work',agg.completed,'awaiting_verification',agg.awaiting_verification,'verified_effective',agg.verified_effective,'failed_verification',agg.failed_verification,'latest_completed_at',agg.latest_completed_at,'latest_verified_at',agg.latest_verified_at,'latest_created_at',agg.latest_created_at,'maintenance_state',case when agg.failed_verification>0 and agg.active>0 then 'followup_required' when agg.awaiting_verification>0 then 'awaiting_independent_verification' when agg.active>0 then 'prevention_active' when agg.verified_effective>0 then 'independently_verified_history' when agg.completed>0 then 'preventive_history' else 'none' end) from agg $$;

create or replace function public.fleet_restroom_preventive_schedule(p_business_id uuid,p_days integer default 90) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rows jsonb; summary jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
 with w as(select w.*,l.name location_name,a.name amenity_name from public.business_restroom_preventive_work_orders w join public.locations l on l.id=w.location_id join public.amenities a on a.id=w.amenity_id where w.business_id=p_business_id and w.created_at>=now()-make_interval(days=>greatest(30,least(coalesce(p_days,90),365))))
 select jsonb_build_object('total',count(*)::int,'active',count(*) filter(where status in('planned','assigned','in_progress'))::int,'overdue',count(*) filter(where status in('planned','assigned','in_progress') and due_at<now())::int,'completed',count(*) filter(where status='completed')::int,'critical_active',count(*) filter(where status in('planned','assigned','in_progress') and priority='critical')::int,'awaiting_verification',count(*) filter(where status='completed' and verification_status='pending')::int,'verified_effective',count(*) filter(where status='completed' and verification_status='effective')::int,'failed_verification',count(*) filter(where status='completed' and verification_status='failed')::int),coalesce(jsonb_agg(to_jsonb(w) order by case when verification_status='failed' then 0 when status in('planned','assigned','in_progress') then 1 when verification_status='pending' then 2 else 3 end,case priority when 'critical' then 0 when 'high' then 1 else 2 end,due_at nulls last,completed_at desc nulls last),'[]'::jsonb) into summary,rows from w;
 return jsonb_build_object('business_id',p_business_id,'summary',coalesce(summary,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'generated_at',now());
end $$;

revoke all on function public.get_location_preventive_verification_opportunities(uuid) from public;
grant execute on function public.get_location_preventive_verification_opportunities(uuid) to anon,authenticated,service_role;
revoke all on function public.confirm_preventive_work_order(uuid,text,text) from public,anon;
grant execute on function public.confirm_preventive_work_order(uuid,text,text) to authenticated,service_role;
revoke all on function public.business_manage_restroom_preventive_work_order(uuid,uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.business_manage_restroom_preventive_work_order(uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
revoke all on function public.get_location_preventive_maintenance_status(uuid) from public;
grant execute on function public.get_location_preventive_maintenance_status(uuid) to anon,authenticated,service_role;
revoke all on function public.fleet_restroom_preventive_schedule(uuid,integer) from public,anon;
grant execute on function public.fleet_restroom_preventive_schedule(uuid,integer) to authenticated,service_role;