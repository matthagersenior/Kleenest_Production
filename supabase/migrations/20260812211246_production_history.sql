-- Core integrity constraints (safe: current production tables are empty for the validated domains).
alter table public.reviews drop constraint if exists reviews_stars_range_check;
alter table public.reviews add constraint reviews_stars_range_check check (stars between 1 and 5);
alter table public.reviews drop constraint if exists reviews_cleanliness_range_check;
alter table public.reviews add constraint reviews_cleanliness_range_check check (cleanliness_pct is null or (cleanliness_pct between 0 and 100));

alter table public.locations drop constraint if exists locations_coordinates_check;
alter table public.locations add constraint locations_coordinates_check check (latitude between -90 and 90 and longitude between -180 and 180);
alter table public.locations drop constraint if exists locations_geofence_radius_check;
alter table public.locations add constraint locations_geofence_radius_check check (geofence_radius_m between 10 and 1000);

alter table public.subscriptions drop constraint if exists subscriptions_exact_owner_check;
alter table public.subscriptions add constraint subscriptions_exact_owner_check check ((user_id is not null) <> (business_id is not null));

-- Query indexes for the actual MVP paths.
create index if not exists locations_active_geom_idx on public.locations using gist (geom) where is_active = true;
create index if not exists reviews_location_status_created_idx on public.reviews(location_id, status, created_at desc);
create index if not exists check_ins_location_checked_idx on public.check_ins(location_id, checked_in_at desc);
create index if not exists check_ins_user_checked_idx on public.check_ins(user_id, checked_in_at desc);
create index if not exists qr_codes_location_active_idx on public.qr_codes(location_id, active);
create index if not exists business_certifications_business_status_idx on public.business_certifications(business_id, status);
create index if not exists business_certifications_active_idx on public.business_certifications(status, expires_at) where status = 'active';

-- Prevent duplicate active certification records for the same business/tier.
create unique index if not exists business_certifications_one_active_per_tier_idx
on public.business_certifications(business_id, certification_tier_id)
where status = 'active';
