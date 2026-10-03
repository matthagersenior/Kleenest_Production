select cron.alter_job(
 job_id:=(select jobid from cron.job where jobname='consumer-discovery-hydrator'),
 command:=$cmd$
 select net.http_post(
  url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/consumer-discovery-hydrator',
  headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-scheduler',(select decrypted_secret from vault.decrypted_secrets where name='kleenest_maps_scheduler' limit 1)),
  body:='{}'::jsonb,
  timeout_milliseconds:=35000
 );
 $cmd$
);
