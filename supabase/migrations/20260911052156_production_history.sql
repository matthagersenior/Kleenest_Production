do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='reconcile-stale-corridor-ingestion-runs' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'reconcile-stale-corridor-ingestion-runs',
  '*/5 * * * *',
  $cmd$
  update public.national_ingestion_runs r
     set status='failed',
         error=coalesce(r.error,'stale execution timeout'),
         finished_at=coalesce(r.finished_at,now()),
         detail=coalesce(r.detail,'{}'::jsonb) || jsonb_build_object(
           'failure_class','stale_execution_timeout',
           'reconciled_at',now()
         )
    from public.national_ingestion_markets m
   where r.market_id=m.id
     and m.market_key like 'focus_corridor_%'
     and r.status='running'
     and r.started_at < now()-interval '2 minutes';
  $cmd$
);
