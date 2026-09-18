alter table public.capability_domain_contracts enable row level security;
alter table public.capability_function_classifications enable row level security;
alter table public.capability_retirement_log enable row level security;
alter table public.contributor_reputation_consistency_audit enable row level security;
alter table public.location_bathroom_intelligence enable row level security;

-- Public capability metadata is operator-owned; deny direct client access and
-- expose it only through explicitly authorized RPCs already present in the platform.
revoke all on public.capability_domain_contracts from anon, authenticated;
revoke all on public.capability_function_classifications from anon, authenticated;
revoke all on public.capability_retirement_log from anon, authenticated;
revoke all on public.contributor_reputation_consistency_audit from anon, authenticated;

-- Bathroom intelligence is consumed through canonical discovery/detail RPCs.
-- Direct table access is intentionally denied so stale/raw intelligence cannot
-- become a parallel public API.
revoke all on public.location_bathroom_intelligence from anon, authenticated;

-- Explicit policies for service/backend roles can be added separately if a
-- direct operational workflow requires them; SECURITY DEFINER canonical RPCs
-- retain controlled access under their own authorization logic.
