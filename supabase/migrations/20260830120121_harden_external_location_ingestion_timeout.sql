create index if not exists idx_locations_ingest_name_coordinates on public.locations (lower(name), latitude, longitude) where latitude is not null and longitude is not null;
create index if not exists idx_external_location_records_source_external on public.external_location_records (source_id,external_id);
alter function public.ingest_external_locations(text,jsonb) set statement_timeout='90s';
