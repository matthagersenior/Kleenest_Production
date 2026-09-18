drop index if exists public.location_bathroom_intelligence_location_idx;

create or replace function public.compact_kleenest_storage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_rows bigint;
  run_rows bigint;
begin
  update public.capability_audit_runs
     set report = '{}'::jsonb
   where executed_at < now() - interval '7 days'
     and report <> '{}'::jsonb;
  get diagnostics audit_rows = row_count;

  update public.national_ingestion_runs
     set detail = '{}'::jsonb
   where finished_at < now() - interval '14 days'
     and detail is not null
     and detail <> '{}'::jsonb;
  get diagnostics run_rows = row_count;

  return jsonb_build_object(
    'capability_audit_reports_compacted', audit_rows,
    'ingestion_run_details_compacted', run_rows
  );
end;
$$;

revoke all on function public.compact_kleenest_storage() from public;
grant execute on function public.compact_kleenest_storage() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname='kleenest-storage-compaction-daily') then
    perform cron.unschedule((select jobid from cron.job where jobname='kleenest-storage-compaction-daily' limit 1));
  end if;
  perform cron.schedule(
    'kleenest-storage-compaction-daily',
    '35 5 * * *',
    'select public.compact_kleenest_storage();'
  );
end $$;
