do $$
begin
  perform cron.unschedule('kleenest-national-ingestion');
exception when others then
  null;
end $$;

select cron.schedule(
  'kleenest-national-ingestion',
  '*/5 * * * *',
  'select public.run_national_ingestion_scheduler();'
);

comment on function public.run_national_ingestion_scheduler() is
  'Runs the guarded national ingestion cycle. Scheduled every 5 minutes to improve market coverage while remaining below configured source quotas.';
