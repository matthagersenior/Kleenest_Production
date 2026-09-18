drop policy if exists fleet_operational_events_admin_or_member_read on public.fleet_operational_events;
create policy fleet_operational_events_authorized_read on public.fleet_operational_events for select to authenticated using (is_platform_owner(auth.uid()) or has_fleet_access(business_id));

drop policy if exists fleet_route_updates_scoped_read on public.fleet_route_updates;
create policy fleet_route_updates_scoped_read on public.fleet_route_updates for select to authenticated using (
  coalesce((select profiles.is_admin from public.profiles where profiles.id=auth.uid()),false)
  or exists (select 1 from public.fleet_routes r where r.id=fleet_route_updates.route_id and has_fleet_access(r.business_id))
  or exists (select 1 from public.fleet_routes r join public.fleet_drivers d on d.id=r.driver_id where r.id=fleet_route_updates.route_id and lower(coalesce(d.email,''))=lower(coalesce((select email from auth.users where id=auth.uid()),'')))
);
