-- Lock down derived external observation evidence to server-side authority.
-- Direct anon/authenticated table access is not part of the Kleenest client contract.

alter table public.external_observation_live_summary enable row level security;

revoke all on table public.external_observation_live_summary from public, anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on table public.external_observation_live_summary to service_role;

drop policy if exists external_observation_live_summary_client_deny
  on public.external_observation_live_summary;

create policy external_observation_live_summary_client_deny
  on public.external_observation_live_summary
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.external_observation_live_summary is
  'Server-only derived external-observation aggregate used by Kleenest trust and restroom intelligence. Direct client access is intentionally denied.';

-- Defense in depth: if this internal view is ever granted to app roles later,
-- execute it with caller permissions so underlying RLS is honored.
alter view public.restroom_intelligence set (security_invoker = true);
revoke all on table public.restroom_intelligence from public, anon, authenticated;
grant select on table public.restroom_intelligence to service_role;

-- This legacy confidence RPC is not used by the repository or any live DB caller.
-- Keeping it service-role-only prevents it from becoming an RLS bypass path.
revoke all on function public.kleenest_location_confidence(uuid)
  from public, anon, authenticated;
grant execute on function public.kleenest_location_confidence(uuid)
  to service_role;

-- Reassert existing server-only authority on the two SECURITY DEFINER writers/readers
-- that consume the aggregate table.
revoke all on function public.compute_bathroom_intelligence(uuid)
  from public, anon, authenticated;
grant execute on function public.compute_bathroom_intelligence(uuid)
  to service_role;

revoke all on function public.refresh_location_trust_state(uuid)
  from public, anon, authenticated;
grant execute on function public.refresh_location_trust_state(uuid)
  to service_role;
