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
   select w.*,l.name location_name,a.name amenity_name
   from public.business_restroom_preventive_work_orders w
   join public.locations l on l.id=w.location_id
   join public.amenities a on a.id=w.amenity_id
   where w.business_id=p_business_id
     and w.created_at>=now()-make_interval(days=>greatest(30,least(coalesce(p_days,90),365)))
 )
 select jsonb_build_object(
   'total',count(*)::int,
   'active',count(*) filter(where status in('planned','assigned','in_progress'))::int,
   'due_soon',count(*) filter(where status in('planned','assigned','in_progress') and due_at>now() and due_at<=now()+interval '4 hours')::int,
   'overdue',count(*) filter(where status in('planned','assigned','in_progress') and due_at<now())::int,
   'escalated',count(*) filter(where status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=1)::int,
   'critical_overdue',count(*) filter(where status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=2)::int,
   'completed',count(*) filter(where status='completed')::int,
   'critical_active',count(*) filter(where status in('planned','assigned','in_progress') and priority='critical')::int,
   'awaiting_verification',count(*) filter(where status='completed' and verification_status='pending')::int,
   'verified_effective',count(*) filter(where status='completed' and verification_status='effective')::int,
   'failed_verification',count(*) filter(where status='completed' and verification_status='failed')::int
 ),
 coalesce(jsonb_agg(to_jsonb(w) order by
   case
     when status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=2 then 0
     when verification_status='failed' then 1
     when status in('planned','assigned','in_progress') and coalesce(escalation_level,0)>=1 then 2
     when status in('planned','assigned','in_progress') and due_at>now() and due_at<=now()+interval '4 hours' then 3
     when status in('planned','assigned','in_progress') then 4
     when verification_status='pending' then 5
     else 6 end,
   case priority when 'critical' then 0 when 'high' then 1 else 2 end,
   due_at nulls last,completed_at desc nulls last),'[]'::jsonb)
 into summary,rows from w;
 return jsonb_build_object('business_id',p_business_id,'summary',coalesce(summary,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'generated_at',now());
end $$;
revoke all on function public.fleet_restroom_preventive_schedule(uuid,integer) from public,anon;
grant execute on function public.fleet_restroom_preventive_schedule(uuid,integer) to authenticated,service_role;
