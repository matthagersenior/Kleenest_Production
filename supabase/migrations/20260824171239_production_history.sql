begin;

-- These are internal worker/catalog tables. They must not be directly writable by client roles.
revoke all on table public.location_address_backfills from anon, authenticated;
revoke all on table public.location_verification_campaigns from anon, authenticated;
revoke all on table public.location_verification_targets from anon, authenticated;
revoke all on table public.map_discovery_cache from anon, authenticated;

-- Entitlements are read-only to the owning user; writes stay server-side.
revoke all on table public.user_feature_entitlements from anon, authenticated;
grant select on table public.user_feature_entitlements to authenticated;

create policy user_feature_entitlements_self_read
on public.user_feature_entitlements
for select to authenticated
using (user_id = auth.uid());

commit;
