-- Consumer telemetry/history policies: preserve semantics with init-plan-safe identity lookup.
drop policy if exists location_departures_select_own on public.location_departures;
create policy location_departures_select_own on public.location_departures
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists discovery_sessions_own_insert on public.location_discovery_sessions;
create policy discovery_sessions_own_insert on public.location_discovery_sessions
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists discovery_sessions_own_read on public.location_discovery_sessions;
create policy discovery_sessions_own_read on public.location_discovery_sessions
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists location_discovery_events_insert_own on public.location_discovery_events;
create policy location_discovery_events_insert_own on public.location_discovery_events
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists location_discovery_events_select_own on public.location_discovery_events;
create policy location_discovery_events_select_own on public.location_discovery_events
for select to authenticated
using (user_id = (select auth.uid()));

-- Account deletion remains RPC-owned; optimize the legacy self policies without broadening access.
drop policy if exists "users can request own deletion" on public.account_deletion_requests;
create policy "users can request own deletion" on public.account_deletion_requests
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users can view own deletion request" on public.account_deletion_requests;
create policy "users can view own deletion request" on public.account_deletion_requests
for select to authenticated
using (user_id = (select auth.uid()));

-- Verification/evidence contributions: preserve public authenticated reads and self-owned writes.
drop policy if exists location_observations_insert_own on public.location_observations;
create policy location_observations_insert_own on public.location_observations
for insert to authenticated
with check (observer_user_id = (select auth.uid()));

drop policy if exists "users can submit own verification observations" on public.location_verification_observations;
create policy "users can submit own verification observations" on public.location_verification_observations
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users can update own verification observations" on public.location_verification_observations;
create policy "users can update own verification observations" on public.location_verification_observations
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Discovery telemetry is append-only for app clients. Keep INSERT/SELECT required by the invoker RPC and self history, remove destructive grants.
revoke delete, update, truncate on table public.location_discovery_events from authenticated;

-- Existing authenticated security-definer consumer mutations use schema-qualified application objects; harden their resolution environment.
alter function public.record_location_departure(uuid,double precision,double precision) set search_path = '';
alter function public.request_account_deletion(text) set search_path = '';
alter function public.submit_restroom_observation(uuid,uuid,text,numeric,text) set search_path = '';
