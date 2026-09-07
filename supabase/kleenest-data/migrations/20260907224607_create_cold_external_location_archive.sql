create table if not exists public.cold_external_location_records (
  id uuid primary key,
  source_id uuid not null,
  external_id text not null,
  record_type text not null,
  location_id uuid,
  latitude double precision,
  longitude double precision,
  name text,
  raw_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  source_updated_at timestamptz,
  active boolean not null,
  archived_at timestamptz not null default now()
);
create unique index if not exists cold_external_location_records_source_external_idx on public.cold_external_location_records(source_id,external_id);
create index if not exists cold_external_location_records_location_idx on public.cold_external_location_records(location_id);
alter table public.cold_external_location_records enable row level security;
revoke all on public.cold_external_location_records from anon, authenticated;
grant select,insert,update,delete on public.cold_external_location_records to service_role;

create or replace function public.ingest_cold_external_location_records(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'batch too large'; end if;
  insert into public.cold_external_location_records(
    id,source_id,external_id,record_type,location_id,latitude,longitude,name,raw_data,first_seen_at,last_seen_at,source_updated_at,active,archived_at)
  select x.id,x.source_id,x.external_id,x.record_type,x.location_id,x.latitude,x.longitude,x.name,coalesce(x.raw_data,'{}'::jsonb),x.first_seen_at,x.last_seen_at,x.source_updated_at,x.active,now()
  from jsonb_to_recordset(p_rows) as x(
    id uuid,source_id uuid,external_id text,record_type text,location_id uuid,latitude double precision,longitude double precision,name text,raw_data jsonb,first_seen_at timestamptz,last_seen_at timestamptz,source_updated_at timestamptz,active boolean)
  on conflict(id) do update set
    source_id=excluded.source_id, external_id=excluded.external_id, record_type=excluded.record_type,
    location_id=excluded.location_id, latitude=excluded.latitude, longitude=excluded.longitude, name=excluded.name,
    raw_data=excluded.raw_data, first_seen_at=excluded.first_seen_at, last_seen_at=excluded.last_seen_at,
    source_updated_at=excluded.source_updated_at, active=excluded.active, archived_at=now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.ingest_cold_external_location_records(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_cold_external_location_records(jsonb) to service_role;
