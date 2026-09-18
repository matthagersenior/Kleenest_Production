create unique index if not exists locations_source_identity_uidx on public.locations (source_dataset, source_external_id) where source_dataset is not null and source_external_id is not null;
