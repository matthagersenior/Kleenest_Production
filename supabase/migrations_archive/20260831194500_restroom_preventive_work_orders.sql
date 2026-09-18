create table if not exists public.business_restroom_preventive_work_orders(
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 location_id uuid not null references public.locations(id) on delete cascade,
 amenity_id uuid not null references public.amenities(id) on delete cascade,
 recommendation_action text not null,
 priority text not null default 'watch' check(priority in('critical','high','watch')),
 status text not null default 'planned' check(status in('planned','assigned','in_progress','completed','dismissed')),
 source_snapshot jsonb not null default '{}'::jsonb,
 assigned_to uuid references auth.users(id) on delete set null,
 due_at timestamptz,assigned_at timestamptz,started_at timestamptz,completed_at timestamptz,dismissed_at timestamptz,
 completion_notes text,proof_media_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.business_restroom_preventive_work_orders enable row level security;
revoke all on public.business_restroom_preventive_work_orders from public,anon,authenticated;
grant all on public.business_restroom_preventive_work_orders to service_role;
create unique index if not exists ux_restroom_preventive_active_pair on public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id) where status in('planned','assigned','in_progress');
create index if not exists ix_restroom_preventive_business_status_due on public.business_restroom_preventive_work_orders(business_id,status,due_at);

create or replace function public.business_restroom_preventive_work_orders(p_business_id uuid,p_days integer default 90) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rec jsonb; rows jsonb; members jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 rec:=public.business_restroom_prevention_recommendations(p_business_id,p_days);
 insert into public.business_restroom_preventive_work_orders(business_id,location_id,amenity_id,recommendation_action,priority,source_snapshot,due_at)
 select p_business_id,(x->>'location_id')::uuid,(x->>'amenity_id')::uuid,x->>'recommended_action',case when coalesce(x->>'priority','watch') in('critical','high','watch') then x->>'priority' else 'watch' end,x,now()+make_interval(hours=>coalesce((x->>'suggested_followup_hours')::int,72))
 from jsonb_array_elements(coalesce(rec->'recommendations','[]'::jsonb)) x where coalesce(x->>'recommended_action','monitor')<>'monitor' on conflict do nothing;
 select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('location_name',l.name,'amenity_name',a.name,'assigned_name',coalesce(p.display_name,p.username)) order by case w.status when 'in_progress' then 0 when 'assigned' then 1 when 'planned' then 2 else 3 end,w.due_at nulls last,w.created_at desc),'[]'::jsonb)
 into rows from public.business_restroom_preventive_work_orders w join public.locations l on l.id=w.location_id join public.amenities a on a.id=w.amenity_id left join public.profiles p on p.id=w.assigned_to where w.business_id=p_business_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',bm.role,'display_name',coalesce(p.display_name,p.username)) order by coalesce(p.display_name,p.username)),'[]'::jsonb) into members from public.business_members bm left join public.profiles p on p.id=bm.user_id where bm.business_id=p_business_id and lower(bm.role::text) in('owner','admin','manager','staff','employee');
 return jsonb_build_object('business_id',p_business_id,'recommendations',coalesce(rec,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'members',coalesce(members,'[]'::jsonb),'generated_at',now());
end $$;

create or replace function public.business_manage_restroom_preventive_work_order(p_business_id uuid,p_work_order_id uuid,p_action text,p_assigned_to uuid default null,p_notes text default null,p_proof_media_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w public.business_restroom_preventive_work_orders; act text:=lower(trim(coalesce(p_action,'')));
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 select * into w from public.business_restroom_preventive_work_orders where id=p_work_order_id and business_id=p_business_id for update;
 if not found then raise exception 'Preventive work order not found'; end if;
 if act='assign' then
   if p_assigned_to is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_assigned_to) then raise exception 'Valid business team member required'; end if;
   update public.business_restroom_preventive_work_orders set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),updated_at=now() where id=w.id;
 elsif act='claim' then update public.business_restroom_preventive_work_orders set status='assigned',assigned_to=uid,assigned_at=now(),updated_at=now() where id=w.id;
 elsif act='start' then update public.business_restroom_preventive_work_orders set status='in_progress',assigned_to=coalesce(assigned_to,uid),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where id=w.id;
 elsif act='complete' then if length(trim(coalesce(p_notes,'')))<3 then raise exception 'Completion notes are required'; end if; update public.business_restroom_preventive_work_orders set status='completed',completion_notes=p_notes,proof_media_id=p_proof_media_id,completed_at=now(),updated_at=now() where id=w.id;
 elsif act='dismiss' then update public.business_restroom_preventive_work_orders set status='dismissed',completion_notes=p_notes,dismissed_at=now(),updated_at=now() where id=w.id;
 elsif act='reopen' then update public.business_restroom_preventive_work_orders set status='planned',assigned_to=null,assigned_at=null,started_at=null,completed_at=null,dismissed_at=null,completion_notes=null,updated_at=now() where id=w.id;
 else raise exception 'Unsupported preventive work-order action'; end if;
 select * into w from public.business_restroom_preventive_work_orders where id=p_work_order_id; return to_jsonb(w);
end $$;

create or replace function public.get_location_preventive_maintenance_status(p_location_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with w as(select * from public.business_restroom_preventive_work_orders where location_id=p_location_id), agg as(select count(*) filter(where status in('planned','assigned','in_progress'))::int active,count(*) filter(where status='completed')::int completed,max(completed_at) filter(where status='completed') latest_completed_at,max(created_at) latest_created_at from w)
 select jsonb_build_object('location_id',p_location_id,'active_preventive_work',agg.active,'completed_preventive_work',agg.completed,'latest_completed_at',agg.latest_completed_at,'latest_created_at',agg.latest_created_at,'maintenance_state',case when agg.active>0 then 'prevention_active' when agg.completed>0 then 'preventive_history' else 'none' end) from agg $$;

create or replace function public.fleet_restroom_preventive_schedule(p_business_id uuid,p_days integer default 90) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rows jsonb; summary jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_fleet_authorized(p_business_id) then raise exception 'Fleet access is not enabled for this business'; end if;
 with w as(select w.*,l.name location_name,a.name amenity_name from public.business_restroom_preventive_work_orders w join public.locations l on l.id=w.location_id join public.amenities a on a.id=w.amenity_id where w.business_id=p_business_id and w.created_at>=now()-make_interval(days=>greatest(30,least(coalesce(p_days,90),365))))
 select jsonb_build_object('total',count(*)::int,'active',count(*) filter(where status in('planned','assigned','in_progress'))::int,'overdue',count(*) filter(where status in('planned','assigned','in_progress') and due_at<now())::int,'completed',count(*) filter(where status='completed')::int,'critical_active',count(*) filter(where status in('planned','assigned','in_progress') and priority='critical')::int),coalesce(jsonb_agg(to_jsonb(w) order by case priority when 'critical' then 0 when 'high' then 1 else 2 end,due_at nulls last),'[]'::jsonb) into summary,rows from w;
 return jsonb_build_object('business_id',p_business_id,'summary',coalesce(summary,'{}'::jsonb),'work_orders',coalesce(rows,'[]'::jsonb),'generated_at',now());
end $$;

revoke all on function public.business_restroom_preventive_work_orders(uuid,integer) from public,anon;
revoke all on function public.business_manage_restroom_preventive_work_order(uuid,uuid,text,uuid,text,uuid) from public,anon;
revoke all on function public.fleet_restroom_preventive_schedule(uuid,integer) from public,anon;
grant execute on function public.business_restroom_preventive_work_orders(uuid,integer) to authenticated,service_role;
grant execute on function public.business_manage_restroom_preventive_work_order(uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
grant execute on function public.fleet_restroom_preventive_schedule(uuid,integer) to authenticated,service_role;
revoke all on function public.get_location_preventive_maintenance_status(uuid) from public;
grant execute on function public.get_location_preventive_maintenance_status(uuid) to anon,authenticated,service_role;