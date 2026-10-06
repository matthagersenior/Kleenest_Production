create schema if not exists archive;

revoke all on schema archive from public;
revoke all on schema archive from anon;
revoke all on schema archive from authenticated;

grant usage on schema archive to service_role;

create table if not exists archive.external_data_sources (
  id uuid primary key,
  source_key text not null,
  name text not null,
  source_url text,
  license_name text,
  license_url text,
  attribution_text text,
  active boolean not null,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz not null default now(),
  source_project_ref text not null default 'ssgesjzdvdsqacdtasje'
);

create unique index if not exists external_data_sources_source_key_uq on archive.external_data_sources(source_key);

create table if not exists archive.external_location_records (
  id uuid primary key,
  source_id uuid not null,
  external_id text not null,
  record_type text not null,
  location_id uuid,
  latitude double precision,
  longitude double precision,
  name text,
  raw_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  source_updated_at timestamptz,
  active boolean not null,
  archived_at timestamptz not null default now(),
  source_project_ref text not null default 'ssgesjzdvdsqacdtasje'
);

create unique index if not exists external_location_records_source_external_uq on archive.external_location_records(source_id, external_id);
create index if not exists external_location_records_location_idx on archive.external_location_records(location_id);

create table if not exists archive.external_observations (
  id uuid primary key,
  source_id uuid not null,
  external_record_id uuid not null,
  location_id uuid,
  attribute_key text not null,
  value_text text,
  value_numeric numeric,
  value_boolean boolean,
  value_json jsonb,
  observed_at timestamptz,
  imported_at timestamptz,
  confidence numeric,
  verification_state text,
  provenance jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  source_project_ref text not null default 'ssgesjzdvdsqacdtasje'
);

create index if not exists external_observations_external_record_idx on archive.external_observations(external_record_id);
create index if not exists external_observations_location_idx on archive.external_observations(location_id);

create table if not exists archive.external_data_datasets (
  id uuid primary key,
  source_id uuid,
  external_dataset_id text not null,
  title text not null,
  publisher text,
  description text,
  landing_url text,
  license_url text,
  license_name text,
  access_level text,
  format text,
  resource_url text,
  spatial boolean not null,
  geography text,
  keywords text[] not null default '{}',
  schema_hint jsonb not null default '{}'::jsonb,
  import_policy text not null,
  status text not null,
  last_cataloged_at timestamptz,
  last_imported_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz not null default now(),
  source_project_ref text not null default 'ssgesjzdvdsqacdtasje'
);

create table if not exists archive.external_import_jobs (
  id uuid primary key,
  dataset_id uuid,
  source_id uuid,
  job_type text not null,
  status text not null,
  query jsonb not null default '{}'::jsonb,
  records_seen integer not null default 0,
  records_imported integer not null default 0,
  observations_imported integer not null default 0,
  errors integer not null default 0,
  error_detail jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  archived_at timestamptz not null default now(),
  source_project_ref text not null default 'ssgesjzdvdsqacdtasje'
);

create table if not exists archive.national_ingestion_runs (
  id uuid primary key,
  market_id uuid,
  source_key text not null,
  status text not null,
  requests_used integer not null default 0,
  bytes_downloaded bigint not null default 0,
  records_seen integer not null default 0,
  records_imported integer not null default 0,
  records_updated integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  archived_at timestamptz not null default now(),
  source_project_ref text not null default 'ssgesjzdvdsqacdtasje'
);

alter table archive.external_data_sources enable row level security;
alter table archive.external_location_records enable row level security;
alter table archive.external_observations enable row level security;
alter table archive.external_data_datasets enable row level security;
alter table archive.external_import_jobs enable row level security;
alter table archive.national_ingestion_runs enable row level security;

grant select, insert, update, delete on all tables in schema archive to service_role;
alter default privileges in schema archive grant select, insert, update, delete on tables to service_role;
