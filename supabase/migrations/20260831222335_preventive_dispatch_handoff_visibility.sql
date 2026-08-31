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
     'location_name',l.name,
     'amenity_name',a.name,
     'assigned_name',coalesce(p.display_name,p.username),
     'fleet_route_stop_id',fs.id,
     'fleet_route_id',fs.route_id,
     'fleet_route_name',fs.route_name,
     'fleet_route_status',fs.route_status,
     'fleet_stop_status',fs.stop_status,
     'fleet_stop_order',fs.stop_order,
     'fleet_scheduled_for',fs.scheduled_for,
     'fleet_dispatch_locked',fs.dispatch_locked
   )
   order by case w.status when 'in_progress' then 0 when 'assigned' then 1 when 'planned' then 2 else 3 end,w.due_at nulls last,w.created_at desc
 ),'[]'::jsonb)
 into rows
 from public.business_restroom_preventive_work_orders w
 join public.locations l on l.id=w.location_id
 join public.amenities a on a.id=w.amenity_id
 left join public.profiles p on p.id=w.assigned_to
 left join lateral (
   select s.id,s.route_id,r.name route_name,r.status route_status,s.status stop_status,s.stop_order,r.scheduled_for,r.dispatch_locked
   from public.fleet_route_stops s
   join public.fleet_routes r on r.id=s.route_id
   where s.business_id=p_business_id
     and s.metadata->>'preventive_work_order_id'=w.id::text
     and r.status not in('cancelled','failed')
   order by case r.status when 'active' then 0 when 'paused' then 1 when 'planned' then 2 when 'completed' then 3 else 4 end,s.created_at desc
   limit 1
 ) fs on true
 where w.business_id=p_business_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',bm.role,'display_name',coalesce(p.display_name,p.username)) order by coalesce(p.display_name,p.username)),'[]'::jsonb)
 into members from public.business_members bm left join public.profiles p on p.id=bm.user_id where bm.business_id=p_business_id and lower(bm.role::text) in('owner','admin','manager','staff','employee');
 return jsonb_build_object('business_id',p_business_id,'recommendations',coalesce(rec,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'members',coalesce(members,'[]'::jsonb),'generated_at',now());
end $$;
revoke all on function public.business_restroom_preventive_work_orders(uuid,integer) from public,anon;
grant execute on function public.business_restroom_preventive_work_orders(uuid,integer) to authenticated,service_role;
