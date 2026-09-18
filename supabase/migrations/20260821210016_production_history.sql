alter table public.map_discovery_cache add column if not exists lease_until timestamptz;
