create table if not exists public.geo_catalog_export_state (
  singleton boolean primary key default true check (singleton),
  last_updated_at timestamptz not null default '1970-01-01 00:00:00+00',
  last_id uuid,
  rows_exported bigint not null default 0,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into public.geo_catalog_export_state(singleton) values(true) on conflict (singleton) do nothing;
alter table public.geo_catalog_export_state enable row level security;
revoke all on public.geo_catalog_export_state from anon, authenticated;

create or replace function public.get_internal_geo_archive_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name='kleenest_geo_archive' limit 1
$$;
revoke all on function public.get_internal_geo_archive_secret() from public, anon, authenticated;
grant execute on function public.get_internal_geo_archive_secret() to service_role;
