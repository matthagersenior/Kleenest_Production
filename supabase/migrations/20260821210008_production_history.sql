create table if not exists public.map_discovery_cache (
  cell_lat numeric(6,2) not null,
  cell_lng numeric(7,2) not null,
  radius_m integer not null default 30000,
  refreshed_at timestamptz not null default now(),
  discovered_count integer not null default 0,
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  primary key (cell_lat, cell_lng)
);

alter table public.map_discovery_cache enable row level security;
revoke all on public.map_discovery_cache from anon, authenticated;

create index if not exists map_discovery_cache_refreshed_idx on public.map_discovery_cache (refreshed_at);
