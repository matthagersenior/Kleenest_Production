
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='review-photo-storage-moderation' limit 1;
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end $$;

select cron.schedule(
  'review-photo-storage-moderation',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/review-photo-storage-moderation',
      body := '{"source":"cron"}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  $cron$
);
