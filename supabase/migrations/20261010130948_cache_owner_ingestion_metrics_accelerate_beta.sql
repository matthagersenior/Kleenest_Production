
create table if not exists public.ingestion_canonical_metrics_cache (
 singleton boolean primary key default true check (singleton),
 total bigint not null default 0,
 added_1h bigint not null default 0,
 added_24h bigint not null default 0,
 updated_24h bigint not null default 0,
 generated_at timestamptz not null default now()
);
alter table public.ingestion_canonical_metrics_cache enable row level security;
revoke all on table public.ingestion_canonical_metrics_cache from public, anon, authenticated;
create or replace function internal.refresh_ingestion_canonical_metrics()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb;
begin
 insert into public.ingestion_canonical_metrics_cache
 (singleton,total,added_1h,added_24h,updated_24h,generated_at)
 select true, count(*)::bigint,
 count(*) filter (where created_at >= now()-interval '1 hour')::bigint,
 count(*) filter (where created_at >= now()-interval '24 hours')::bigint,
 count(*) filter (where updated_at >= now()-interval '24 hours')::bigint,
 now() from public.locations
 on conflict(singleton) do update set
 total=excluded.total, added_1h=excluded.added_1h,
 added_24h=excluded.added_24h, updated_24h=excluded.updated_24h,
 generated_at=excluded.generated_at;
 select jsonb_build_object(
 'total', total,'added_1h',added_1h,'added_24h',added_24h,
 'updated_24h',updated_24h,'generated_at',generated_at,
 'count_source','cached_exact')
 into v_snapshot from public.ingestion_canonical_metrics_cache where singleton;
 return v_snapshot;
end $$;
revoke all on function internal.refresh_ingestion_canonical_metrics() from public, anon, authenticated;
select internal.refresh_ingestion_canonical_metrics();
select cron.schedule(
 'kleenest-ingestion-canonical-metrics',
 '*/5 * * * *',
 'select internal.refresh_ingestion_canonical_metrics()'
);
create or replace function public.owner_ingestion_control_snapshot(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
 v_status jsonb; v_marked_running integer:=0; v_live_runs integer:=0;
 v_stale_markets integer:=0; v_capacity jsonb; v_background jsonb;
 v_policy jsonb; v_canonical jsonb; v_pipeline jsonb;
begin
 if v_uid is null or not public.is_platform_owner(v_uid) then
   raise exception 'Platform owner access required';
 end if;
 v_status:=public.admin_national_ingestion_status();
 v_capacity:=public.acquisition_capacity_status();
 v_pipeline:=public.ingestion_pipeline_status();
 select to_jsonb(p) into v_policy from public.ingestion_capacity_policy p where singleton=true;
 v_marked_running:=coalesce((v_status->'markets'->>'running')::integer,0);
 select count(*)::integer into v_live_runs from public.national_ingestion_runs r
   where r.status='running' and r.started_at>=now()-interval '30 minutes';
 select count(*)::integer into v_stale_markets from public.national_ingestion_markets m
   where m.status='running' and coalesce(m.updated_at,m.last_run_at,'epoch'::timestamptz)<now()-interval '30 minutes';
 v_status:=jsonb_set(v_status,'{markets,marked_running}',to_jsonb(v_marked_running),true);
 v_status:=jsonb_set(v_status,'{markets,stale_running}',to_jsonb(v_stale_markets),true);
 v_status:=jsonb_set(v_status,'{markets,running}',to_jsonb(v_live_runs),true);
 select jsonb_build_object(
   'enabled_sources',count(*) filter(where a.enabled),
   'due_sources',count(*) filter(where a.enabled and a.next_run_at<=now()),
   'last_run_at',max(a.last_run_at),
   'last_success_at',max(a.last_success_at),
   'sources',coalesce(jsonb_agg(to_jsonb(a) order by a.source_key) filter(where a.enabled),'[]'::jsonb)
 ) into v_background from public.external_ingestion_adapters a;
 select jsonb_build_object('total',c.total,'added_1h',c.added_1h,
   'added_24h',c.added_24h,'updated_24h',c.updated_24h,
   'generated_at',c.generated_at,'count_source','cached_exact')
 into v_canonical from public.ingestion_canonical_metrics_cache c where c.singleton;
 return jsonb_build_object(
   'status',v_status,'capacity',coalesce(v_capacity,'{}'::jsonb),
   'capacity_policy',coalesce(v_policy,'{}'::jsonb),
   'canonical',coalesce(v_canonical,'{}'::jsonb),
   'pipeline',coalesce(v_pipeline,'{}'::jsonb),
   'background',coalesce(v_background,'{}'::jsonb),
   'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority)
      from public.national_ingestion_source_policies s
      where s.enabled or s.source_key in ('osm','overture','data_gov')),'[]'::jsonb),
   'markets',coalesce((select jsonb_agg(to_jsonb(m) order by m.priority,m.population_rank nulls last)
      from (select * from public.national_ingestion_markets
        where status not in ('retired','archived')
        order by priority,population_rank nulls last limit v_limit) m),'[]'::jsonb),
   'storage_guard',coalesce(v_status->'storage_guard','{}'::jsonb),
   'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select * from public.platform_owner_control_audit
        where domain='ingestion' order by created_at desc limit v_limit) a),'[]'::jsonb),
   'generated_at',now());
end $$;
-- Beta/production: widen bounded tile headroom; pressure controls still govern runtime.
update public.ingestion_capacity_policy
set max_parallel_tiles=8, canonical_batch_size=250,updated_at=now()
where singleton=true;
-- Civic ingestion stages <=250-row candidate batches and the processor stays bounded.
update public.external_ingestion_adapters set page_size=500,updated_at=now()
where adapter_kind='socrata' and enabled and page_size<500;
