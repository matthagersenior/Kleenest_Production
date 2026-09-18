-- Keep the descriptive location_observations_location_observed_idx; remove the exact unconstrained duplicate.
drop index if exists public.idx_location_observations_location_time;
