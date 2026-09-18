create table if not exists public.corridor_open_data_runtime (
  source_key text primary key references public.external_data_sources(source_key) on update cascade on delete restrict,
  enabled boolean not null default false,
  cursor_offset bigint not null default 0,
  page_size integer not null default 100 check (page_size between 1 and 500),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_seen integer not null default 0,
  last_imported integer not null default 0,
  last_updated integer not null default 0,
  total_seen bigint not null default 0,
  total_imported bigint not null default 0,
  total_updated bigint not null default 0,
  next_run_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.corridor_open_data_runtime enable row level security;
revoke all on public.corridor_open_data_runtime from anon, authenticated;
grant select,insert,update on public.corridor_open_data_runtime to service_role;
insert into public.corridor_open_data_runtime(source_key,enabled,page_size,next_run_at)
values
 ('chicago_business_licenses',true,100,now()),
 ('kcmo_business_licenses',true,100,now())
on conflict(source_key) do update set enabled=excluded.enabled,page_size=excluded.page_size,next_run_at=least(public.corridor_open_data_runtime.next_run_at,now()),updated_at=now();
