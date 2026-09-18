create or replace function public.strip_cold_location_metadata()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.source_metadata is not null then
    new.source_metadata := new.source_metadata - 'captured_at';
  end if;
  return new;
end
$function$;

drop trigger if exists locations_strip_cold_metadata on public.locations;
create trigger locations_strip_cold_metadata
before insert or update of source_metadata on public.locations
for each row execute function public.strip_cold_location_metadata();

delete from public.national_ingestion_runs
where started_at <= timestamptz '2026-09-08 20:35:02.768506+00';
