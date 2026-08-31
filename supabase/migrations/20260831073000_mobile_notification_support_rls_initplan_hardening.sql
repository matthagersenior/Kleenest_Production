drop policy if exists notification_deliveries_own_read on public.notification_deliveries;
create policy notification_deliveries_own_read on public.notification_deliveries
for select to authenticated
using (recipient_user_id = (select auth.uid()));

drop policy if exists notification_events_authenticated_read on public.notification_events;
create policy notification_events_authenticated_read on public.notification_events
for select to authenticated
using (
  actor_user_id = (select auth.uid())
  or audience_scope = any (array['public'::text, 'community'::text])
);
