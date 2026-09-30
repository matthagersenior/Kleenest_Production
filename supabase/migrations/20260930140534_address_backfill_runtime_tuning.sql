-- Keep each scheduled reverse-geocode batch comfortably inside pg_net and Edge Function timeouts.

do $$
begin
  perform cron.unschedule('kleenest-address-backfill');
exception when others then
  null;
end
$$;

select cron.schedule(
  'kleenest-address-backfill',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/backfill-location-addresses',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-kleenest-worker-secret',
        (select decrypted_secret
           from vault.decrypted_secrets
          where name = 'kleenest_address_backfill_worker_secret'
          limit 1)
      ),
      body := '{"limit":6,"source":"cron"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
