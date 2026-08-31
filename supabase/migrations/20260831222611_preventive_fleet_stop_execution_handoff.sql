create or replace function public.sync_preventive_work_from_fleet_stop()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_work_order_id uuid;
  w public.business_restroom_preventive_work_orders%rowtype;
  r public.fleet_routes%rowtype;
  v_location_name text;
  v_amenity_name text;
begin
  if new.status is not distinct from old.status then return new; end if;
  begin v_work_order_id:=nullif(new.metadata->>'preventive_work_order_id','')::uuid; exception when others then return new; end;
  if v_work_order_id is null then return new; end if;
  select * into w from public.business_restroom_preventive_work_orders where id=v_work_order_id and business_id=new.business_id for update;
  if not found then return new; end if;
  select * into r from public.fleet_routes where id=new.route_id and business_id=new.business_id;
  select l.name,a.name into v_location_name,v_amenity_name from public.locations l join public.amenities a on a.id=w.amenity_id where l.id=w.location_id;
  if new.status='servicing' and w.status in('planned','assigned') then
    update public.business_restroom_preventive_work_orders
      set status='in_progress',started_at=coalesce(started_at,new.actual_service_started_at,now()),updated_at=now()
      where id=w.id and status in('planned','assigned');
  elsif new.status='completed' and w.status in('planned','assigned','in_progress') then
    insert into public.notifications(user_id,type,title,body,data)
    select distinct bm.user_id,'preventive_fleet_stop_completed','Fleet stop complete — maintenance signoff required',
      coalesce(v_location_name,'A restroom')||' · '||coalesce(v_amenity_name,'Amenity')||' reached Fleet stop completion. Add maintenance notes/proof on the preventive work order before completing it.',
      jsonb_build_object('business_id',w.business_id,'work_order_id',w.id,'route_id',new.route_id,'route_stop_id',new.id,'location_id',w.location_id,'amenity_id',w.amenity_id,'fleet_route_name',r.name,'destination','/location/'||w.location_id::text,'web_destination','/workspace/business?business='||w.business_id::text||'&focus=prevention&work_order='||w.id::text)
    from public.business_members bm where bm.business_id=w.business_id and lower(bm.role::text) in('owner','admin','manager');
  elsif new.status='skipped' and w.status in('planned','assigned','in_progress') then
    insert into public.notifications(user_id,type,title,body,data)
    select distinct bm.user_id,'preventive_fleet_stop_skipped','Preventive Fleet stop skipped',
      coalesce(v_location_name,'A restroom')||' · '||coalesce(v_amenity_name,'Amenity')||' was skipped on its Fleet route. The preventive work order remains active.',
      jsonb_build_object('business_id',w.business_id,'work_order_id',w.id,'route_id',new.route_id,'route_stop_id',new.id,'location_id',w.location_id,'amenity_id',w.amenity_id,'fleet_route_name',r.name,'destination','/location/'||w.location_id::text,'web_destination','/workspace/business?business='||w.business_id::text||'&focus=prevention&work_order='||w.id::text)
    from public.business_members bm where bm.business_id=w.business_id and lower(bm.role::text) in('owner','admin','manager');
  end if;
  return new;
end $$;
revoke all on function public.sync_preventive_work_from_fleet_stop() from public,anon,authenticated;
grant execute on function public.sync_preventive_work_from_fleet_stop() to service_role;

drop trigger if exists trg_sync_preventive_work_from_fleet_stop on public.fleet_route_stops;
create trigger trg_sync_preventive_work_from_fleet_stop
after update of status on public.fleet_route_stops
for each row execute function public.sync_preventive_work_from_fleet_stop();
