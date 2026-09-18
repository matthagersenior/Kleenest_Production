create table if not exists public.external_ingestion_adapters(
 source_key text primary key references public.external_data_sources(source_key) on update cascade on delete cascade,
 adapter_kind text not null check(adapter_kind in ('socrata','arcgis','geojson','bulk')),
 endpoint_url text not null,
 enabled boolean not null default false,
 page_size integer not null default 100 check(page_size between 1 and 500),
 cursor_offset bigint not null default 0,
 refresh_interval_minutes integer not null default 1440 check(refresh_interval_minutes between 5 and 10080),
 next_run_at timestamptz not null default now(),
 field_map jsonb not null default '{}'::jsonb,
 static_metadata jsonb not null default '{}'::jsonb,
 last_run_at timestamptz,
 last_success_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.external_ingestion_adapters enable row level security;
revoke all on public.external_ingestion_adapters from anon,authenticated;
grant select,insert,update,delete on public.external_ingestion_adapters to service_role;

insert into public.external_ingestion_adapters(
 source_key,adapter_kind,endpoint_url,enabled,page_size,cursor_offset,refresh_interval_minutes,next_run_at,field_map,static_metadata,updated_at
) values (
 'chicago_business_licenses','socrata','https://data.cityofchicago.org/resource/uupf-x98q.json',true,100,0,1440,now(),
 jsonb_build_object(
   'id','id','name','doing_business_as_name','name_fallback','legal_name','address','address','city','city','state','state','postal_code','zip_code','latitude','latitude','longitude','longitude','category','license_description'
 ),
 jsonb_build_object('provider','socrata','dataset','Business Licenses - Current Active','publisher','City of Chicago','market_key','focus_corridor_chicago'),
 now()
)
on conflict(source_key) do update set
 adapter_kind=excluded.adapter_kind,endpoint_url=excluded.endpoint_url,enabled=excluded.enabled,page_size=excluded.page_size,
 refresh_interval_minutes=excluded.refresh_interval_minutes,field_map=excluded.field_map,static_metadata=excluded.static_metadata,updated_at=now();
