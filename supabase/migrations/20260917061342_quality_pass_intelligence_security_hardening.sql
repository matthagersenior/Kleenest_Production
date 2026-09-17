revoke all on function public.consumer_nearby_progression_opportunities(double precision,double precision,integer) from public;
revoke all on function public.consumer_nearby_progression_opportunities(double precision,double precision,integer) from anon;
grant execute on function public.consumer_nearby_progression_opportunities(double precision,double precision,integer) to authenticated;

drop policy if exists location_trust_watches_select_own on public.location_trust_watches;
create policy location_trust_watches_select_own on public.location_trust_watches
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists location_trust_watches_insert_own on public.location_trust_watches;
create policy location_trust_watches_insert_own on public.location_trust_watches
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists location_trust_watches_update_own on public.location_trust_watches;
create policy location_trust_watches_update_own on public.location_trust_watches
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists location_trust_watches_delete_own on public.location_trust_watches;
create policy location_trust_watches_delete_own on public.location_trust_watches
for delete to authenticated
using (user_id = (select auth.uid()));
