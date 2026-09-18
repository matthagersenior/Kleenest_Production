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
  'markets',jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),'running',count(*) filter(where status='running'),'pending',count(*) filter(where status='pending'),'failed',count(*) filter(where status='failed'),'blocked',count(*) filter(where status='blocked')),
  'current_market',(select to_jsonb(m) from public.national_ingestion_markets m where m.status in ('running','pending') order by m.priority,m.population_rank nulls last limit 1),
  'top_10',(select coalesce(jsonb_agg(to_jsonb(t) order by t.population_rank),'[]'::jsonb) from public.national_ingestion_markets t where t.market_kind='city' and t.population_rank<=10),
  'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.priority),'[]'::jsonb) from public.national_ingestion_source_policies s),
  'today_usage',(select coalesce(jsonb_agg(to_jsonb(u)),'[]'::jsonb) from (select source_key,sum(requests_used)::int requests_used,sum(bytes_downloaded)::bigint bytes_downloaded,sum(records_imported)::int records_imported,sum(records_updated)::int records_updated from public.national_ingestion_runs where started_at>=date_trunc('day',now()) group by source_key) u),
  'recent_runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc),'[]'::jsonb) from (select id,market_id,source_key,status,requests_used,bytes_downloaded,records_seen,records_imported,records_updated,error,started_at,finished_at from public.national_ingestion_runs order by started_at desc limit 12) r),
  'storage_guard',public.national_ingestion_storage_status()
 ) into v from public.national_ingestion_markets;
 return v;
end $$;
revoke all on function public.admin_set_national_ingestion_resume_authorization(boolean) from public, anon;
grant execute on function public.admin_set_national_ingestion_resume_authorization(boolean) to authenticated;
revoke all on function public.admin_national_ingestion_status() from public, anon;
grant execute on function public.admin_national_ingestion_status() to authenticated;
