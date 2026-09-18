revoke insert, update, delete, truncate, references, trigger on table public.external_location_records from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.location_amenities from anon, authenticated;
comment on table public.external_location_records is 'Readable through the public API as configured by RLS; all writes are server-side ingestion authority only.';
comment on table public.location_amenities is 'Public read surface; mutations are authorized through location/business amenity RPCs rather than direct Data API writes.';
