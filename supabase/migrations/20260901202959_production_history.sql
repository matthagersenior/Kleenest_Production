create or replace function public.admin_national_ingestion_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v jsonb;
begin
 if not public.is_platform_owner(auth.uid()) then raise exception 'Platform owner access required'; end if;
 select jsonb_build_object(
  'refreshed_at',now(),
  'markets',jsonb_build_object(
    'total',count(*),
    'completed',count(*) filter(where status='completed'),
    'running',count(*) filter(where status='running'),
    'pending',count(*) filter(where status='pending'),
    'failed',count(*) filter(where status='failed'),
    'blocked',count(*) filter(where status='blocked')
  ),
  'current_market',(select to_jsonb(m) from public.national_ingestion_markets m where m.status='running' order by m.last_run_at asc nulls first,m.priority,m.population_rank nulls last limit 1),
  'active_markets',(select coalesce(jsonb_agg(to_jsonb(m) order by m.priority,m.population_rank nulls last),'[]'::jsonb) from public.national_ingestion_markets m where m.status='running'),
  'top_10',(select coalesce(jsonb_agg(to_jsonb(t) order by t.population_rank),'[]'::jsonb) from public.national_ingestion_markets t where t.market_kind='city' and t.population_rank<=10),
  'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.priority),'[]'::jsonb) from public.national_ingestion_source_policies s),
  'today_usage',(select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) from (
    select source_key,sum(requests_used)::int requests_used,sum(bytes_downloaded)::bigint bytes_downloaded,
      sum(records_seen)::int records_seen,sum(records_imported)::int records_imported,sum(records_updated)::int records_updated,
      count(*)::int runs,count(*) filter(where status='completed')::int completed_runs,count(*) filter(where status='failed')::int failed_runs
    from public.national_ingestion_runs where started_at>=date_trunc('day',now()) group by source_key
  ) u),
  'recent_runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]'::jsonb) from (
    select nr.id,nr.market_id,m.market_key,m.name market_name,m.state_code,nr.source_key,nr.status,nr.requests_used,nr.bytes_downloaded,
      nr.records_seen,nr.records_imported,nr.records_updated,nr.error,nr.detail,nr.started_at,nr.finished_at
    from public.national_ingestion_runs nr
    left join public.national_ingestion_markets m on m.id=nr.market_id
    order by nr.started_at desc limit 24
  ) r),
  'scheduler',(select coalesce((select jsonb_build_object('jobname',j.jobname,'schedule',j.schedule,'active',j.active) from cron.job j where j.jobname='kleenest-national-ingestion' limit 1),'{}'::jsonb)),
  'storage_guard',public.national_ingestion_storage_status()
 ) into v from public.national_ingestion_markets;
 return v;
end;
$$;

revoke all on function public.admin_national_ingestion_status() from public, anon;
grant execute on function public.admin_national_ingestion_status() to authenticated;
