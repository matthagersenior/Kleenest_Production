alter table public.national_ingestion_markets drop constraint if exists national_ingestion_markets_status_check;
alter table public.national_ingestion_markets add constraint national_ingestion_markets_status_check check (status = any (array['pending'::text,'running'::text,'completed'::text,'blocked'::text,'failed'::text,'paused'::text]));
