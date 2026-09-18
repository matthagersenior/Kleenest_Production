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
      and coalesce(d.status,'pending') not in ('submitted','delivered','expired')
      and coalesce(d.attempts,0) < p_max_attempts
    for update of t
  ), claimed as (
    insert into public.notification_native_push_deliveries(notification_id,token_id,status,attempts,updated_at)
    select p_notification_id,e.token_id,'pending',e.prior_attempts+1,pg_catalog.now()
    from eligible e
    on conflict(notification_id,token_id) do update
      set status='pending',attempts=public.notification_native_push_deliveries.attempts+1,updated_at=pg_catalog.now()
      where public.notification_native_push_deliveries.status not in ('submitted','delivered','expired')
        and public.notification_native_push_deliveries.attempts < p_max_attempts
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

-- Retire the internal prototype authority if it exists; the worker calls the
-- service-role-only public RPC because public is exposed through PostgREST.
do $$
begin
  if to_regprocedure('internal.claim_native_push_deliveries(uuid,integer)') is not null then
    execute 'revoke all on function internal.claim_native_push_deliveries(uuid,integer) from public,anon,authenticated,service_role';
  end if;
end;
$$;
