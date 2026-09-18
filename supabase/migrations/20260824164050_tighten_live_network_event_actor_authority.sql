begin;

drop policy if exists live_network_events_insert_authenticated on public.live_network_events;
create policy live_network_events_insert_authenticated
on public.live_network_events
for insert
to authenticated
with check (actor_id = auth.uid());

commit;
