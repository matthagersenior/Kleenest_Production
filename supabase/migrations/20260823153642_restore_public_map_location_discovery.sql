drop policy if exists locations_public_select on public.locations;
create policy locations_public_select on public.locations
for select
to anon, authenticated
using (is_active = true);
