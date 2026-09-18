
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='kleenest-owner-email-notifications' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'kleenest-owner-email-notifications',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/owner-email-notifications',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-owner-email-worker',(select decrypted_secret from vault.decrypted_secrets where name='owner_email_worker_secret' limit 1)
    ),
    body:='{"mode":"scheduled"}'::jsonb,
    timeout_milliseconds:=15000
  );
  $job$
);
