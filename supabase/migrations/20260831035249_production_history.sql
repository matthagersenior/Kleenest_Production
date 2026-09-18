alter table public.notification_native_push_deliveries
  add column if not exists receipt_attempts integer not null default 0,
  add column if not exists receipt_checked_at timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists notification_native_push_deliveries_receipt_queue_idx
  on public.notification_native_push_deliveries(status, sent_at)
  where status='submitted' and provider_message_id is not null;

alter function public.register_notification_native_push_token(text,text,text) set search_path = '';
alter function public.remove_notification_native_push_token(text) set search_path = '';
alter function public.enqueue_notification_native_push_delivery() set search_path = '';
alter function public.get_push_worker_secret() set search_path = '';

revoke all on function public.register_notification_native_push_token(text,text,text) from public, anon;
grant execute on function public.register_notification_native_push_token(text,text,text) to authenticated;
revoke all on function public.remove_notification_native_push_token(text) from public, anon;
grant execute on function public.remove_notification_native_push_token(text) to authenticated;
revoke all on function public.enqueue_notification_native_push_delivery() from public, anon, authenticated;
revoke all on function public.get_push_worker_secret() from public, anon, authenticated;
grant execute on function public.get_push_worker_secret() to service_role;

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='kleenest-native-push-receipts' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end
$$;

select cron.schedule(
  'kleenest-native-push-receipts',
  '* * * * *',
  $cron$
  select net.http_post(
    url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/reconcile-native-push-receipts',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-kleenest-worker-secret',(select worker_secret from internal.push_worker_config where id=true limit 1)
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  );
  $cron$
);
