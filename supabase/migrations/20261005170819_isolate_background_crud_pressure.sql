-- Keep heavyweight background CRUD work staggered away from hot request paths.

alter function public.backfill_location_brand_identities(integer) set statement_timeout='60s';
alter function public.owner_email_collect_signals() set statement_timeout='45s';
alter function public.run_capability_audit(text) set statement_timeout='45s';

select cron.unschedule('kleenest-brand-identity-backfill');
select cron.schedule('kleenest-brand-identity-backfill','47 * * * *',$$select public.backfill_location_brand_identities(100);$$);

select cron.unschedule('kleenest-capability-audit-hourly');
select cron.schedule('kleenest-capability-audit-hourly','37 * * * *',$$select public.run_capability_audit('scheduled');$$);
