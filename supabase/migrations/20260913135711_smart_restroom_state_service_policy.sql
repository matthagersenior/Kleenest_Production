drop policy if exists location_smart_restroom_service_role on public.location_smart_restroom_state;
create policy location_smart_restroom_service_role
on public.location_smart_restroom_state
for all
to service_role
using (true)
with check (true);
