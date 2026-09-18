create unique index if not exists locations_source_dataset_external_id_uq on public.locations(source_dataset, source_external_id) where source_dataset is not null and source_external_id is not null;
create index if not exists locations_place_type_idx on public.locations(place_type);
create index if not exists locations_bathroom_status_idx on public.locations(bathroom_verification_status);
create index if not exists locations_active_source_idx on public.locations(is_active, source, source_dataset);
