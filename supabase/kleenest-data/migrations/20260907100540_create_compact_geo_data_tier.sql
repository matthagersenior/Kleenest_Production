create extension if not exists pgcrypto with schema extensions;

create table if not exists public.geo_locations (
  id uuid primary key,
  name text not null,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  latitude double precision not null,
  longitude double precision not null,
  place_type text,
  phone text,
  website text,
  source text not null,
  source_dataset text,
  source_external_id text,
  source_metadata jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists geo_locations_lat_lng_idx on public.geo_locations(latitude, longitude);
create index if not exists geo_locations_state_city_idx on public.geo_locations(state, city);
create index if not exists geo_locations_place_type_idx on public.geo_locations(place_type);
create unique index if not exists geo_locations_source_external_uidx on public.geo_locations(source_dataset, source_external_id) where source_dataset is not null and source_external_id is not null;

alter table public.geo_locations enable row level security;
revoke all on public.geo_locations from anon, authenticated;
