-- Wire the consumer hydration queue to a bounded worker. A follow-up migration restores the universal discovery function after this scheduler wiring.
do $$
begin
 if not exists(select 1 from cron.job where jobname='consumer-discovery-hydrator') then
  perform cron.schedule('consumer-discovery-hydrator','* * * * *',$cmd$
   select net.http_post(
    url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/consumer-discovery-hydrator',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=55000
   );
  $cmd$);
 end if;
end $$;
