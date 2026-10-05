SELECT cron.unschedule('kleenest-brand-registry-refresh');
SELECT cron.schedule('kleenest-brand-registry-refresh','24 3 * * 0',$$SET LOCAL statement_timeout='90s'; SELECT public.refresh_brand_identity_registry();$$);
