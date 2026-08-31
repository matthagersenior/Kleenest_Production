create or replace function public.business_restroom_preventive_work_orders(p_business_id uuid, p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); rec jsonb; rows jsonb; members jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 rec:=public.business_restroom_prevention_recommendations(p_business_id,p_days);
 insert into public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id,recommendation_action,priority,source_snapshot,due_at)
 select p_business_id,(x->>'location_id')::uuid,(x->>'amenity_id')::uuid,x->>'recommended_action',case when coalesce(x->>'priority','watch') in('critical','high','watch') then x->>'priority' else 'watch' end,x,now()+make_interval(hours=>coalesce((x->>'suggested_followup_hours')::int,72))
 from jsonb_array_elements(coalesce(rec->'recommendations','[]'::jsonb)) x where coalesce(x->>'recommended_action','monitor')<>'monitor' on conflict do nothing;
 select coalesce(jsonb_agg(
   to_jsonb(w)||jsonb_build_object(
     'location_name',l.name,'amenity_name',a.name,'assigned_name',coalesce(p.display_name,p.username),
     'fleet_route_stop_id',fs.id,'fleet_route_id',fs.route_id,'fleet_route_name',fs.route_name,'fleet_route_status',fs.route_status,
     'fleet_stop_status',fs.stop_status,'fleet_stop_order',fs.stop_order,'fleet_scheduled_for',fs.scheduled_for,'fleet_dispatch_locked',fs.dispatch_locked,
     'fleet_arrived_at',fs.actual_arrived_at,'fleet_service_started_at',fs.actual_service_started_at,'fleet_stop_completed_at',fs.actual_completed_at,'fleet_departed_at',fs.actual_departed_at,
     'fleet_signoff_required',(fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress')),
     'fleet_signoff_age_minutes',case when fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress') then floor(extract(epoch from (now()-fs.actual_completed_at))/60)::int else null end
   )
   order by case when fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress') then 0 when w.status='in_progress' then 1 when w.status='assigned' then 2 when w.status='planned' then 3 else 4 end,w.due_at nulls last,w.created_at desc
 ),'[]'::jsonb)
 into rows
 from public.business_restroom_preventive_work_orders w
 join public.locations l on l.id=w.location_id
 join public.amenities a on a.id=w.amenity_id
 left join public.profiles p on p.id=w.assigned_to
 left join lateral (
   select s.id,s.route_id,r.name route_name,r.status route_status,s.status stop_status,s.stop_order,r.scheduled_for,r.dispatch_locked,s.actual_arrived_at,s.actual_service_started_at,s.actual_completed_at,s.actual_departed_at
   from public.fleet_route_stops s join public.fleet_routes r on r.id=s.route_id
   where s.business_id=p_business_id and s.metadata->>'preventive_work_order_id'=w.id::text and r.status not in('cancelled','failed')
   order by case r.status when 'active' then 0 when 'paused' then 1 when 'planned' then 2 when 'completed' then 3 else 4 end,s.created_at desc limit 1
 ) fs on true
 where w.business_id=p_business_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',bm.role,'display_name',coalesce(p.display_name,p.username)) order by coalesce(p.display_name,p.username)),'[]'::jsonb)
 into members from public.business_members bm left join public.profiles p on p.id=bm.user_id where bm.business_id=p_business_id and lower(bm.role::text) in('owner','admin','manager','staff','employee');
 return jsonb_build_object('business_id',p_business_id,'recommendations',coalesce(rec,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'members',coalesce(members,'[]'::jsonb),'generated_at',now());
end $$;
revoke all on function public.business_restroom_preventive_work_orders(uuid,integer) from public,anon;
grant execute on function public.business_restroom_preventive_work_orders(uuid,integer) to authenticated,service_role;

create or replace function public.fleet_restroom_preventive_schedule(p_business_id uuid,p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); rows jsonb; summary jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
 with w as(
   select w.*,l.name location_name,a.name amenity_name,fs.id fleet_route_stop_id,fs.route_id fleet_route_id,fs.route_name fleet_route_name,fs.stop_status fleet_stop_status,fs.stop_order fleet_stop_order,fs.actual_service_started_at fleet_service_started_at,fs.actual_completed_at fleet_stop_completed_at,
     (fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress')) fleet_signoff_required,
     case when fs.actual_completed_at is not null and w.status in('planned','assigned','in_progress') then floor(extract(epoch from (now()-fs.actual_completed_at))/60)::int else null end fleet_signoff_age_minutes
   from public.business_restroom_preventive_work_orders w
   join public.locations l on l.id=w.location_id join public.amenities a on a.id=w.amenity_id
   left join lateral (
     select s.id,s.route_id,r.name route_name,s.status stop_status,s.stop_order,s.actual_service_started_at,s.actual_completed_at
     from public.fleet_route_stops s join public.fleet_routes r on r.id=s.route_id
     where s.business_id=p_business_id and s.metadata->>'preventive_work_order_id'=w.id::text and r.status not in('cancelled','failed')
     order by s.created_at desc limit 1
   ) fs on true
   where w.business_id=p_business_id and w.created_at>=now()-make_interval(days=>greatest(30,least(coalesce(p_days,90),365)))
 )
 select jsonb_build_object(
   'total',count(*)::int,'active',count(*) filter(where status in('planned','assigned','in_progress'))::int,
   'due_soon',count(*) filter(where status in('planned','assigned','in_progress') and due_at>now() and due_at<=now()+interval '4 hours')::int,
   'overdue',count(*) filter(where status in('planned','assigned','in_progress') and due_at<now())::int,
   'escalated',count(*) filter(where status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=1)::int,
   'critical_overdue',count(*) filter(where status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=2)::int,
   'signoff_backlog',count(*) filter(where fleet_signoff_required)::int,
   'signoff_over_2h',count(*) filter(where fleet_signoff_required and fleet_signoff_age_minutes>=120)::int,
   'completed',count(*) filter(where status='completed')::int,'critical_active',count(*) filter(where status in('planned','assigned','in_progress') and priority='critical')::int,
   'awaiting_verification',count(*) filter(where status='completed' and verification_status='pending')::int,'verified_effective',count(*) filter(where status='completed' and verification_status='effective')::int,'failed_verification',count(*) filter(where status='completed' and verification_status='failed')::int
 ),coalesce(jsonb_agg(to_jsonb(w) order by case when fleet_signoff_required then 0 when status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=2 then 1 when verification_status='failed' then 2 when status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=1 then 3 when status in('planned','assigned','in_progress') and due_at>now() and due_at<=now()+interval '4 hours' then 4 when status in('planned','assigned','in_progress') then 5 when verification_status='pending' then 6 else 7 end,case priority when 'critical' then 0 when 'high' then 1 else 2 end,due_at nulls last,completed_at desc nulls last),'[]'::jsonb)
 into summary,rows from w;
 return jsonb_build_object('business_id',p_business_id,'summary',coalesce(summary,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'generated_at',now());
end $$;
revoke all on function public.fleet_restroom_preventive_schedule(uuid,integer) from public,anon;
grant execute on function public.fleet_restroom_preventive_schedule(uuid,integer) to authenticated,service_role;
