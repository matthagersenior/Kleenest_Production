drop policy if exists enterprise_intelligence_events_authenticated_read on public.enterprise_intelligence_events;
create policy enterprise_intelligence_events_scoped_read on public.enterprise_intelligence_events for select to authenticated using (
 is_platform_owner(auth.uid()) or exists (select 1 from public.enterprise_partner_networks n join public.business_members bm on bm.business_id=n.owner_business_id where n.id=enterprise_intelligence_events.network_id and bm.user_id=auth.uid()) or exists (select 1 from public.enterprise_partner_network_members nm join public.business_members bm on bm.business_id=nm.partner_business_id where nm.network_id=enterprise_intelligence_events.network_id and nm.status='active' and bm.user_id=auth.uid())
);

drop policy if exists fleet_performance_events_authenticated_read on public.fleet_performance_events;
create policy fleet_performance_events_scoped_read on public.fleet_performance_events for select to authenticated using (
 is_platform_owner(auth.uid()) or exists (select 1 from public.fleet_vehicles fv join public.business_members bm on bm.business_id=fv.business_id where fv.id=fleet_performance_events.fleet_vehicle_id and bm.user_id=auth.uid()) or exists (select 1 from public.fleet_routes r join public.business_members bm on bm.business_id=r.business_id where r.id=fleet_performance_events.route_id and bm.user_id=auth.uid())
);
