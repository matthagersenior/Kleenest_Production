create or replace function internal.claim_native_push_deliveries(p_notification_id uuid, p_max_attempts integer default 5)
returns table(id uuid, token_id uuid, token text, platform text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notification_id is null then raise exception 'notification_id is required'; end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20 then raise exception 'invalid max attempts'; end if;

  return query
  with eligible as (
    select t.id as token_id,t.token,t.platform,coalesce(d.attempts,0) as prior_attempts
    from public.notification_native_push_tokens t
    left join public.notification_native_push_deliveries d
      on d.notification_id=p_notification_id and d.token_id=t.id
    join public.notifications n on n.id=p_notification_id and n.user_id=t.user_id
    where t.active=true
      and coalesce(d.attempts,0) < p_max_attempts
      and (
        d.id is null
        or d.status='failed'
        or (d.status='pending' and d.updated_at < pg_catalog.now() - interval '5 minutes')
      )
    for update of t
  ), claimed as (
    insert into public.notification_native_push_deliveries(notification_id,token_id,status,attempts,updated_at)
    select p_notification_id,e.token_id,'pending',e.prior_attempts+1,pg_catalog.now()
    from eligible e
    on conflict(notification_id,token_id) do update
      set status='pending',attempts=public.notification_native_push_deliveries.attempts+1,updated_at=pg_catalog.now(),last_error=null
      where public.notification_native_push_deliveries.attempts < p_max_attempts
        and (
          public.notification_native_push_deliveries.status='failed'
          or (
            public.notification_native_push_deliveries.status='pending'
            and public.notification_native_push_deliveries.updated_at < pg_catalog.now() - interval '5 minutes'
          )
        )
    returning public.notification_native_push_deliveries.id,
              public.notification_native_push_deliveries.token_id,
              public.notification_native_push_deliveries.attempts
  )
  select c.id,c.token_id,e.token,e.platform,c.attempts
  from claimed c
  join eligible e on e.token_id=c.token_id;
end;
$$;

create or replace function public.claim_native_push_deliveries(p_notification_id uuid, p_max_attempts integer default 5)
returns table(id uuid, token_id uuid, token text, platform text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_notification_id is null then raise exception 'notification_id is required'; end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20 then raise exception 'invalid max attempts'; end if;

  return query
  with eligible as (
    select t.id as token_id,t.token,t.platform,coalesce(d.attempts,0) as prior_attempts
    from public.notification_native_push_tokens t
    left join public.notification_native_push_deliveries d
      on d.notification_id=p_notification_id and d.token_id=t.id
    join public.notifications n on n.id=p_notification_id and n.user_id=t.user_id
    where t.active=true
      and coalesce(d.attempts,0) < p_max_attempts
      and (
        d.id is null
        or d.status='failed'
        or (d.status='pending' and d.updated_at < pg_catalog.now() - interval '5 minutes')
      )
    for update of t
  ), claimed as (
    insert into public.notification_native_push_deliveries(notification_id,token_id,status,attempts,updated_at)
    select p_notification_id,e.token_id,'pending',e.prior_attempts+1,pg_catalog.now()
    from eligible e
    on conflict(notification_id,token_id) do update
      set status='pending',attempts=public.notification_native_push_deliveries.attempts+1,updated_at=pg_catalog.now(),last_error=null
      where public.notification_native_push_deliveries.attempts < p_max_attempts
        and (
          public.notification_native_push_deliveries.status='failed'
          or (
            public.notification_native_push_deliveries.status='pending'
            and public.notification_native_push_deliveries.updated_at < pg_catalog.now() - interval '5 minutes'
          )
        )
    returning public.notification_native_push_deliveries.id,
              public.notification_native_push_deliveries.token_id,
              public.notification_native_push_deliveries.attempts
  )
  select c.id,c.token_id,e.token,e.platform,c.attempts
  from claimed c
  join eligible e on e.token_id=c.token_id;
end;
$$;
revoke all on function public.claim_native_push_deliveries(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_native_push_deliveries(uuid,integer) to service_role;

create or replace function internal.recover_stale_native_push_deliveries(
  p_lease_minutes integer default 5,
  p_max_attempts integer default 5
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_notification_id uuid;
  v_requeued integer := 0;
begin
  if p_lease_minutes < 1 or p_lease_minutes > 60 then raise exception 'invalid lease minutes'; end if;
  if p_max_attempts < 1 or p_max_attempts > 20 then raise exception 'invalid max attempts'; end if;

  update public.notification_native_push_deliveries d
     set status='failed',
         last_error=pg_catalog.concat('Native push claim lease expired after max attempts (',p_max_attempts,')'),
         updated_at=pg_catalog.now()
   where d.status='pending'
     and d.updated_at < pg_catalog.now() - pg_catalog.make_interval(mins => p_lease_minutes)
     and d.attempts >= p_max_attempts;

  select c.worker_secret into v_secret
  from internal.push_worker_config c
  where c.id=true;

  if v_secret is null then
    raise exception 'Push worker secret is not configured';
  end if;

  for v_notification_id in
    select distinct d.notification_id
    from public.notification_native_push_deliveries d
    where d.status='pending'
      and d.updated_at < pg_catalog.now() - pg_catalog.make_interval(mins => p_lease_minutes)
      and d.attempts < p_max_attempts
  loop
    perform net.http_post(
      url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/deliver-native-push-notification',
      headers:=pg_catalog.jsonb_build_object(
        'Content-Type','application/json',
        'x-kleenest-worker-secret',v_secret
      ),
      body:=pg_catalog.jsonb_build_object('notification_id',v_notification_id),
      timeout_milliseconds:=10000
    );
    v_requeued := v_requeued + 1;
  end loop;

  return v_requeued;
end;
$$;
revoke all on function internal.recover_stale_native_push_deliveries(integer,integer) from public,anon,authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='kleenest-native-push-pending-recovery';

select cron.schedule(
  'kleenest-native-push-pending-recovery',
  '* * * * *',
  $$select internal.recover_stale_native_push_deliveries(5,5);$$
);
