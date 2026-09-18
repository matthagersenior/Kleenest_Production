create or replace function public.strip_external_location_raw_payload()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.raw_data := '{}'::jsonb;
  return new;
end;
$$;

drop trigger if exists external_location_records_strip_raw_payload on public.external_location_records;
create trigger external_location_records_strip_raw_payload
before insert or update of raw_data on public.external_location_records
for each row execute function public.strip_external_location_raw_payload();

comment on function public.strip_external_location_raw_payload() is 'Keeps external raw payload history out of the Production hot database; durable provenance is archived in Kleenest_Data.';
