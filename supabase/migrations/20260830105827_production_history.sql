create table if not exists public.national_ingestion_markets (
  id uuid primary key default gen_random_uuid(), market_key text not null unique, name text not null, state_code text,
  market_kind text not null check (market_kind in ('city','state_fill')), population_rank integer, priority integer not null,
  bbox jsonb, status text not null default 'pending' check (status in ('pending','running','completed','blocked','failed')),
  current_source text, tile_cursor integer not null default 0, tile_count integer, attempt_count integer not null default 0,
  source_progress jsonb not null default '{}'::jsonb, last_error text, started_at timestamptz, completed_at timestamptz,
  last_run_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.national_ingestion_source_policies (
  source_key text primary key, enabled boolean not null default true, priority integer not null default 100,
  quota_mode text not null default 'fixed', daily_request_limit integer, hourly_request_limit integer, daily_byte_limit bigint,
  min_interval_seconds integer not null default 0, max_requests_per_cycle integer not null default 1,
  policy_url text, notes text, updated_at timestamptz not null default now()
);
create table if not exists public.national_ingestion_runs (
  id uuid primary key default gen_random_uuid(), market_id uuid references public.national_ingestion_markets(id) on delete set null,
  source_key text not null, status text not null check (status in ('running','completed','partial','skipped','failed')),
  requests_used integer not null default 0, bytes_downloaded bigint not null default 0, records_seen integer not null default 0,
  records_imported integer not null default 0, records_updated integer not null default 0, detail jsonb not null default '{}'::jsonb,
  error text, started_at timestamptz not null default now(), finished_at timestamptz
);
create index if not exists national_ingestion_runs_source_started_idx on public.national_ingestion_runs(source_key,started_at desc);
create index if not exists national_ingestion_markets_queue_idx on public.national_ingestion_markets(status,priority,population_rank nulls last);
insert into public.national_ingestion_source_policies(source_key,enabled,priority,quota_mode,daily_request_limit,hourly_request_limit,daily_byte_limit,min_interval_seconds,max_requests_per_cycle,policy_url,notes) values
 ('osm',true,10,'fixed',100,null,10000000,60,1,'https://wiki.openstreetmap.org/wiki/Overpass_API','Regular automated public-instance budget: stay below about 100 requests and 10 MB/day; one request at a time with backoff.'),
 ('data_gov',true,20,'runtime_headers',50,30,null,2,3,'https://resources.data.gov/catalog-api/','Defaults to DEMO_KEY limits until DATA_GOV_API_KEY is configured; personal-key allowance is read at runtime.'),
 ('refuge_restrooms',false,30,'adapter_pending',null,null,null,2,1,'https://refugerestrooms.org','Registered evidence source; enable when provider adapter and current terms are verified.'),
 ('nps',false,40,'key_required',null,1000,null,2,2,'https://www.nps.gov/subjects/developer/guides.htm','Enable after NPS_API_KEY-backed adapter is deployed.'),
 ('transit_gtfs',false,50,'feed_specific',null,null,null,2,1,'https://gtfs.org/','Enable per market when an authoritative agency feed is discovered.'),
 ('stlouis_open_data',false,60,'market_specific',null,null,null,2,1,'https://www.stlouis-mo.gov/data/','Local source retained as provenance; national scheduling uses market-specific source discovery.')
on conflict(source_key) do update set enabled=excluded.enabled,priority=excluded.priority,quota_mode=excluded.quota_mode,daily_request_limit=excluded.daily_request_limit,hourly_request_limit=excluded.hourly_request_limit,daily_byte_limit=excluded.daily_byte_limit,min_interval_seconds=excluded.min_interval_seconds,max_requests_per_cycle=excluded.max_requests_per_cycle,policy_url=excluded.policy_url,notes=excluded.notes,updated_at=now();
insert into public.national_ingestion_markets(market_key,name,state_code,market_kind,population_rank,priority,bbox) values
 ('city_nyc','New York City','NY','city',1,1,'[40.4774,-74.2591,40.9176,-73.7004]'::jsonb),
 ('city_los_angeles','Los Angeles','CA','city',2,2,'[33.7037,-118.6682,34.3373,-117.6464]'::jsonb),
 ('city_chicago','Chicago','IL','city',3,3,'[41.6445,-87.9401,42.0230,-87.5237]'::jsonb),
 ('city_houston','Houston','TX','city',4,4,'[29.5236,-95.9097,30.1107,-95.0145]'::jsonb),
 ('city_phoenix','Phoenix','AZ','city',5,5,'[33.2903,-112.3240,33.9206,-111.9260]'::jsonb),
 ('city_philadelphia','Philadelphia','PA','city',6,6,'[39.8670,-75.2800,40.1370,-74.9550]'::jsonb),
 ('city_san_antonio','San Antonio','TX','city',7,7,'[29.1870,-98.8130,29.7610,-98.2230]'::jsonb),
 ('city_san_diego','San Diego','CA','city',8,8,'[32.5340,-117.2820,33.1140,-116.9080]'::jsonb),
 ('city_dallas','Dallas','TX','city',9,9,'[32.6170,-97.0000,33.0230,-96.4630]'::jsonb),
 ('city_jacksonville','Jacksonville','FL','city',10,10,'[30.1030,-82.0500,30.5860,-81.3160]'::jsonb)
on conflict(market_key) do update set name=excluded.name,state_code=excluded.state_code,market_kind=excluded.market_kind,population_rank=excluded.population_rank,priority=excluded.priority,bbox=coalesce(public.national_ingestion_markets.bbox,excluded.bbox),updated_at=now();
insert into public.national_ingestion_markets(market_key,name,state_code,market_kind,priority) values
 ('state_al','Alabama','AL','state_fill',1101),('state_ak','Alaska','AK','state_fill',1102),('state_az','Arizona','AZ','state_fill',1103),('state_ar','Arkansas','AR','state_fill',1104),('state_ca','California','CA','state_fill',1105),('state_co','Colorado','CO','state_fill',1106),('state_ct','Connecticut','CT','state_fill',1107),('state_de','Delaware','DE','state_fill',1108),('state_fl','Florida','FL','state_fill',1109),('state_ga','Georgia','GA','state_fill',1110),('state_hi','Hawaii','HI','state_fill',1111),('state_id','Idaho','ID','state_fill',1112),('state_il','Illinois','IL','state_fill',1113),('state_in','Indiana','IN','state_fill',1114),('state_ia','Iowa','IA','state_fill',1115),('state_ks','Kansas','KS','state_fill',1116),('state_ky','Kentucky','KY','state_fill',1117),('state_la','Louisiana','LA','state_fill',1118),('state_me','Maine','ME','state_fill',1119),('state_md','Maryland','MD','state_fill',1120),('state_ma','Massachusetts','MA','state_fill',1121),('state_mi','Michigan','MI','state_fill',1122),('state_mn','Minnesota','MN','state_fill',1123),('state_ms','Mississippi','MS','state_fill',1124),('state_mo','Missouri','MO','state_fill',1125),('state_mt','Montana','MT','state_fill',1126),('state_ne','Nebraska','NE','state_fill',1127),('state_nv','Nevada','NV','state_fill',1128),('state_nh','New Hampshire','NH','state_fill',1129),('state_nj','New Jersey','NJ','state_fill',1130),('state_nm','New Mexico','NM','state_fill',1131),('state_ny','New York','NY','state_fill',1132),('state_nc','North Carolina','NC','state_fill',1133),('state_nd','North Dakota','ND','state_fill',1134),('state_oh','Ohio','OH','state_fill',1135),('state_ok','Oklahoma','OK','state_fill',1136),('state_or','Oregon','OR','state_fill',1137),('state_pa','Pennsylvania','PA','state_fill',1138),('state_ri','Rhode Island','RI','state_fill',1139),('state_sc','South Carolina','SC','state_fill',1140),('state_sd','South Dakota','SD','state_fill',1141),('state_tn','Tennessee','TN','state_fill',1142),('state_tx','Texas','TX','state_fill',1143),('state_ut','Utah','UT','state_fill',1144),('state_vt','Vermont','VT','state_fill',1145),('state_va','Virginia','VA','state_fill',1146),('state_wa','Washington','WA','state_fill',1147),('state_wv','West Virginia','WV','state_fill',1148),('state_wi','Wisconsin','WI','state_fill',1149),('state_wy','Wyoming','WY','state_fill',1150),('state_dc','District of Columbia','DC','state_fill',1151)
on conflict(market_key) do nothing;
create or replace function public.admin_national_ingestion_status() returns jsonb language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v jsonb;
begin
 if not public.is_platform_owner(auth.uid()) then raise exception 'Platform owner access required'; end if;
 select jsonb_build_object(
  'markets',jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),'running',count(*) filter(where status='running'),'pending',count(*) filter(where status='pending'),'failed',count(*) filter(where status='failed'),'blocked',count(*) filter(where status='blocked')),
  'current_market',(select to_jsonb(m) from public.national_ingestion_markets m where m.status in ('running','pending') order by m.priority,m.population_rank nulls last limit 1),
  'top_10',(select coalesce(jsonb_agg(to_jsonb(t) order by t.population_rank),'[]'::jsonb) from public.national_ingestion_markets t where t.market_kind='city' and t.population_rank<=10),
  'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.priority),'[]'::jsonb) from public.national_ingestion_source_policies s),
  'today_usage',(select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) from (select source_key,sum(requests_used)::int requests_used,sum(bytes_downloaded)::bigint bytes_downloaded,sum(records_imported)::int records_imported,sum(records_updated)::int records_updated from public.national_ingestion_runs where started_at>=date_trunc('day',now()) group by source_key) u),
  'recent_runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]'::jsonb) from (select id,market_id,source_key,status,requests_used,bytes_downloaded,records_seen,records_imported,records_updated,error,started_at,finished_at from public.national_ingestion_runs order by started_at desc limit 12) r)
 ) into v from public.national_ingestion_markets;
 return v;
end $$;
revoke all on function public.admin_national_ingestion_status() from public,anon;
grant execute on function public.admin_national_ingestion_status() to authenticated;
alter table public.national_ingestion_markets enable row level security;
alter table public.national_ingestion_source_policies enable row level security;
alter table public.national_ingestion_runs enable row level security;
revoke all on public.national_ingestion_markets,public.national_ingestion_source_policies,public.national_ingestion_runs from anon,authenticated;
select cron.unschedule(jobid) from cron.job where jobname in ('kleenest-maps-st-louis','kleenest-maps-kansas-city');
select cron.schedule('kleenest-national-ingestion','*/15 * * * *', $cron$
select net.http_post(url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/national-ingestion-orchestrator',headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',(select decrypted_secret from vault.decrypted_secrets where name='kleenest_maps_scheduler')),body:='{"action":"cycle"}'::jsonb);
$cron$);
