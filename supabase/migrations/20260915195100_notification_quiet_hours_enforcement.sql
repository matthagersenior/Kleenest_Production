create or replace function internal.notification_native_push_allowed(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_push boolean := true;
  v_start time without time zone;
  v_end time without time zone;
  v_timezone text;
  v_local_time time without time zone;
begin
  select
    pg_catalog.coalesce(np.push,true),
    np.quiet_hours_start,
    np.quiet_hours_end,
    pg_catalog.coalesce(np.quiet_hours_timezone,'UTC')
  into v_push,v_start,v_end,v_timezone
  from (select 1) seed
  left join public.notification_preferences np on np.user_id=p_user_id;

  if not pg_catalog.coalesce(v_push,true) then return false; end if;
  if v_start is null or v_end is null or v_start = v_end then return true; end if;

  v_local_time := (pg_catalog.now() at time zone v_timezone)::time;
  if v_start < v_end then
    return not (v_local_time >= v_start and v_local_time < v_end);
  end if;
  return not (v_local_time >= v_start or v_local_time < v_end);
end;
$$;

revoke all on function internal.notification_native_push_allowed(uuid) from public,anon;
grant execute on function internal.notification_native_push_allowed(uuid) to authenticated,service_role;

drop trigger if exists notifications_native_push_delivery on public.notifications;
create trigger notifications_native_push_delivery
after insert on public.notifications
for each row
when (internal.notification_native_push_allowed(new.user_id))
execute function public.enqueue_notification_native_push_delivery();
