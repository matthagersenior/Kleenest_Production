revoke execute on function public.process_intelligence_notification_jobs(integer) from public,anon,authenticated;
revoke execute on function public.process_intelligence_action_jobs(integer) from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from cron.job where jobname='kleenest-intelligence-notification-worker') then perform cron.schedule('kleenest-intelligence-notification-worker','* * * * *','select public.process_intelligence_notification_jobs(50);'); end if;
 if not exists(select 1 from cron.job where jobname='kleenest-intelligence-action-worker') then perform cron.schedule('kleenest-intelligence-action-worker','*/5 * * * *','select public.process_intelligence_action_jobs(50);'); end if;
end $$;
