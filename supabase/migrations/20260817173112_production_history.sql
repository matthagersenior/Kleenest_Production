begin;

-- Remove broad table DML. All mutation paths must use protected RPCs or explicit RLS policies.
revoke insert, update, delete, truncate, references, trigger on table public.ad_placements from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.business_earned_perks from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.business_geofences from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.business_progression_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.business_search_boosts from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.family_accounts from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.family_invites from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.fleet_driver_scorecards from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.fleet_maintenance_records from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.fleet_vehicle_daily_metrics from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.location_claims from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.location_favorites from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.location_route_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.location_submissions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.pricing_plans from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.qr_redemptions from anon, authenticated;

-- Anonymous clients only need read access to the public catalog/advertising surfaces.
revoke all on table public.ad_placements from anon, authenticated;
revoke all on table public.pricing_plans from anon, authenticated;
grant select on table public.ad_placements to anon, authenticated;
grant select on table public.pricing_plans to anon, authenticated;

-- All other audited tables become RLS protected and are only readable by the owning user/business context.
alter table public.business_earned_perks enable row level security;
alter table public.business_geofences enable row level security;
alter table public.business_progression_events enable row level security;
alter table public.business_search_boosts enable row level security;
alter table public.family_accounts enable row level security;
alter table public.family_invites enable row level security;
alter table public.fleet_driver_scorecards enable row level security;
alter table public.fleet_maintenance_records enable row level security;
alter table public.fleet_vehicle_daily_metrics enable row level security;
alter table public.location_claims enable row level security;
alter table public.location_favorites enable row level security;
alter table public.location_route_events enable row level security;
alter table public.location_submissions enable row level security;
alter table public.qr_redemptions enable row level security;

-- Remove any legacy policies with the names used by this hardening migration.
drop policy if exists kleenest_business_earned_perks_manage on public.business_earned_perks;
drop policy if exists kleenest_business_geofences_manage on public.business_geofences;
drop policy if exists kleenest_business_progression_events_read on public.business_progression_events;
drop policy if exists kleenest_business_search_boosts_manage on public.business_search_boosts;
drop policy if exists kleenest_family_accounts_owner on public.family_accounts;
drop policy if exists kleenest_family_invites_sender on public.family_invites;
drop policy if exists kleenest_fleet_driver_scorecards_manage on public.fleet_driver_scorecards;
drop policy if exists kleenest_fleet_maintenance_manage on public.fleet_maintenance_records;
drop policy if exists kleenest_fleet_vehicle_metrics_manage on public.fleet_vehicle_daily_metrics;
drop policy if exists kleenest_location_claims_access on public.location_claims;
drop policy if exists kleenest_location_favorites_owner on public.location_favorites;
drop policy if exists kleenest_location_route_events_owner on public.location_route_events;
drop policy if exists kleenest_location_submissions_owner on public.location_submissions;
drop policy if exists kleenest_qr_redemptions_owner on public.qr_redemptions;

create policy kleenest_business_earned_perks_manage on public.business_earned_perks for select to authenticated using (public.business_can_manage(business_id));
create policy kleenest_business_geofences_manage on public.business_geofences for select to authenticated using (public.business_can_manage(business_id));
create policy kleenest_business_progression_events_read on public.business_progression_events for select to authenticated using (public.business_can_manage(business_id) or user_id = auth.uid());
create policy kleenest_business_search_boosts_manage on public.business_search_boosts for select to authenticated using (public.business_can_manage(business_id));
create policy kleenest_family_accounts_owner on public.family_accounts for select to authenticated using (owner_user_id = auth.uid());
create policy kleenest_family_invites_sender on public.family_invites for select to authenticated using (invited_by = auth.uid());
create policy kleenest_fleet_driver_scorecards_manage on public.fleet_driver_scorecards for select to authenticated using (public.business_can_manage(business_id));
create policy kleenest_fleet_maintenance_manage on public.fleet_maintenance_records for select to authenticated using (public.business_can_manage(business_id));
create policy kleenest_fleet_vehicle_metrics_manage on public.fleet_vehicle_daily_metrics for select to authenticated using (public.business_can_manage(business_id));
create policy kleenest_location_claims_access on public.location_claims for select to authenticated using (claimed_by = auth.uid() or public.business_can_manage(business_id));
create policy kleenest_location_favorites_owner on public.location_favorites for select to authenticated using (user_id = auth.uid());
create policy kleenest_location_route_events_owner on public.location_route_events for select to authenticated using (user_id = auth.uid());
create policy kleenest_location_submissions_owner on public.location_submissions for select to authenticated using (submitted_by = auth.uid() or (claimed_business_id is not null and public.business_can_manage(claimed_business_id)));
create policy kleenest_qr_redemptions_owner on public.qr_redemptions for select to authenticated using (user_id = auth.uid());

-- Pricing is now a read-only compatibility catalog. Canonical purchase/entitlement logic remains server-side.
comment on table public.pricing_plans is 'READ-ONLY compatibility catalog. Do not use as the authoritative checkout/entitlement source; canonical pricing contract must be maintained by the platform pricing catalog.';

commit;
