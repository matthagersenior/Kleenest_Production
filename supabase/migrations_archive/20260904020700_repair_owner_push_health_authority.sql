-- Repair KleenestOS push-health RPCs after profile/auth schema convergence.
-- COALESCE is a SQL special form and must not be schema-qualified.

create or replace function public.admin_notification_push_delivery_summary(
  p_from timestamptz default now()-interval '7 days',
  p_to timestamptz default now()
)
returns table(status text,delivery_count bigint,last_updated_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_user
      and (
        coalesce(p.is_platform_owner,false)
        or coalesce(p.is_admin,false)
        or lower(coalesce(p.role::text,''::text)) in ('admin','owner','platform_admin','super_admin')
      )
  ) then raise exception 'Admin authorization required'; end if;
  return query
  select d.status,count(*)::bigint,max(d.updated_at)
  from public.notification_push_deliveries d
  where d.created_at>=coalesce(p_from,now()-interval '7 days')
    and d.created_at<=coalesce(p_to,now())
  group by d.status order by d.status;
end;
$$;

create or replace function public.admin_notification_native_push_delivery_health(
  p_from timestamptz default now()-interval '7 days',
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_from timestamptz := coalesce(p_from,now()-interval '7 days');
  v_to timestamptz := coalesce(p_to,now());
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_user
      and (
        coalesce(p.is_platform_owner,false)
        or coalesce(p.is_admin,false)
        or lower(coalesce(p.role::text,''::text)) in ('admin','owner','platform_admin','super_admin')
      )
  ) then raise exception 'Admin authorization required'; end if;

  select jsonb_build_object(
    'window_from',v_from,
    'window_to',v_to,
    'active_tokens',(select count(*) from public.notification_native_push_tokens t where t.active=true),
    'inactive_tokens',(select count(*) from public.notification_native_push_tokens t where t.active=false),
    'delivery_count',count(*),
    'pending',count(*) filter(where d.status='pending'),
    'submitted',count(*) filter(where d.status='submitted'),
    'delivered',count(*) filter(where d.status='delivered'),
    'failed',count(*) filter(where d.status='failed'),
    'expired',count(*) filter(where d.status='expired'),
    'oldest_submitted_at',min(d.sent_at) filter(where d.status='submitted'),
    'last_delivery_update_at',max(d.updated_at),
    'exhausted_submitted',count(*) filter(where d.status='submitted' and d.receipt_attempts>=8),
    'max_receipt_attempts',coalesce(max(d.receipt_attempts),0),
    'status_counts',coalesce((
      select jsonb_object_agg(s.status,s.delivery_count)
      from (
        select d2.status,count(*)::bigint delivery_count
        from public.notification_native_push_deliveries d2
        where d2.created_at>=v_from and d2.created_at<=v_to
        group by d2.status
      ) s
    ),'{}'::jsonb)
  ) into v_result
  from public.notification_native_push_deliveries d
  where d.created_at>=v_from and d.created_at<=v_to;
  return v_result;
end;
$$;
