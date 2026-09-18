drop policy if exists notification_native_push_tokens_self_select on public.notification_native_push_tokens;
create policy notification_native_push_tokens_self_select
on public.notification_native_push_tokens
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notification_native_push_tokens_self_delete on public.notification_native_push_tokens;
create policy notification_native_push_tokens_self_delete
on public.notification_native_push_tokens
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notification_native_push_deliveries_self_select on public.notification_native_push_deliveries;
create policy notification_native_push_deliveries_self_select
on public.notification_native_push_deliveries
for select to authenticated
using (
  exists (
    select 1
    from public.notification_native_push_tokens t
    where t.id = notification_native_push_deliveries.token_id
      and t.user_id = (select auth.uid())
  )
);

revoke all privileges on table public.social_activity from anon, authenticated;

drop policy if exists social_activity_own_insert on public.social_activity;
create policy social_activity_own_insert
on public.social_activity
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (actor_user_id is null or (select auth.uid()) = actor_user_id)
);

drop policy if exists social_activity_public_read on public.social_activity;
create policy social_activity_public_read
on public.social_activity
for select to authenticated
using (
  user_id = (select auth.uid())
  or actor_user_id = (select auth.uid())
);

create or replace function public.admin_notification_push_delivery_summary(
  p_from timestamptz default (pg_catalog.now() - interval '7 days'),
  p_to timestamptz default pg_catalog.now()
)
returns table(status text, delivery_count bigint, last_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not exists(
    select 1
    from public.profiles p
    where p.id = v_user
      and (p.is_admin = true or pg_catalog.lower(pg_catalog.coalesce(p.role::text,'')) in ('admin','owner','platform_admin','super_admin'))
  ) then
    raise exception 'Admin authorization required';
  end if;
  return query
  select d.status, pg_catalog.count(*)::bigint, pg_catalog.max(d.updated_at)
  from public.notification_push_deliveries d
  where d.created_at >= pg_catalog.coalesce(p_from, pg_catalog.now() - interval '7 days')
    and d.created_at <= pg_catalog.coalesce(p_to, pg_catalog.now())
  group by d.status
  order by d.status;
end;
$$;
revoke all on function public.admin_notification_push_delivery_summary(timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_notification_push_delivery_summary(timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.admin_notification_native_push_delivery_health(
  p_from timestamptz default (pg_catalog.now() - interval '7 days'),
  p_to timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_from timestamptz := pg_catalog.coalesce(p_from, pg_catalog.now() - interval '7 days');
  v_to timestamptz := pg_catalog.coalesce(p_to, pg_catalog.now());
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not exists(
    select 1
    from public.profiles p
    where p.id = v_user
      and (p.is_admin = true or pg_catalog.lower(pg_catalog.coalesce(p.role::text,'')) in ('admin','owner','platform_admin','super_admin'))
  ) then
    raise exception 'Admin authorization required';
  end if;

  select pg_catalog.jsonb_build_object(
    'window_from', v_from,
    'window_to', v_to,
    'active_tokens', (select pg_catalog.count(*) from public.notification_native_push_tokens t where t.active = true),
    'inactive_tokens', (select pg_catalog.count(*) from public.notification_native_push_tokens t where t.active = false),
    'delivery_count', pg_catalog.count(*),
    'pending', pg_catalog.count(*) filter (where d.status = 'pending'),
    'submitted', pg_catalog.count(*) filter (where d.status = 'submitted'),
    'delivered', pg_catalog.count(*) filter (where d.status = 'delivered'),
    'failed', pg_catalog.count(*) filter (where d.status = 'failed'),
    'expired', pg_catalog.count(*) filter (where d.status = 'expired'),
    'oldest_submitted_at', pg_catalog.min(d.sent_at) filter (where d.status = 'submitted'),
    'last_delivery_update_at', pg_catalog.max(d.updated_at),
    'exhausted_submitted', pg_catalog.count(*) filter (where d.status = 'submitted' and d.receipt_attempts >= 8),
    'max_receipt_attempts', pg_catalog.coalesce(pg_catalog.max(d.receipt_attempts),0),
    'status_counts', pg_catalog.coalesce(
      (
        select pg_catalog.jsonb_object_agg(s.status, s.delivery_count)
        from (
          select d2.status, pg_catalog.count(*)::bigint as delivery_count
          from public.notification_native_push_deliveries d2
          where d2.created_at >= v_from and d2.created_at <= v_to
          group by d2.status
        ) s
      ),
      '{}'::jsonb
    )
  ) into v_result
  from public.notification_native_push_deliveries d
  where d.created_at >= v_from and d.created_at <= v_to;

  return v_result;
end;
$$;
revoke all on function public.admin_notification_native_push_delivery_health(timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_notification_native_push_delivery_health(timestamptz,timestamptz) to authenticated, service_role;
