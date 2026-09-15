alter table public.notification_preferences
  add column if not exists quiet_hours_timezone text;

create or replace function public.set_my_notification_quiet_hours(
  p_start time without time zone,
  p_end time without time zone,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_timezone text := pg_catalog.nullif(pg_catalog.btrim(p_timezone),'');
  v_row public.notification_preferences%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_start is null or p_end is null then raise exception 'Quiet hours require both a start and end time'; end if;
  if p_start = p_end then raise exception 'Quiet hours start and end must be different'; end if;
  if v_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then
    raise exception 'Unsupported time zone';
  end if;

  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  update public.notification_preferences
  set quiet_hours_start=p_start,
      quiet_hours_end=p_end,
      quiet_hours_timezone=v_timezone,
      updated_at=pg_catalog.now()
  where user_id=v_uid
  returning * into v_row;
  return pg_catalog.to_jsonb(v_row);
end;
$$;

create or replace function public.clear_my_notification_quiet_hours()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.notification_preferences%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  update public.notification_preferences
  set quiet_hours_start=null,
      quiet_hours_end=null,
      quiet_hours_timezone=null,
      updated_at=pg_catalog.now()
  where user_id=v_uid
  returning * into v_row;
  return pg_catalog.to_jsonb(v_row);
end;
$$;

revoke all on function public.set_my_notification_quiet_hours(time without time zone,time without time zone,text) from public,anon;
grant execute on function public.set_my_notification_quiet_hours(time without time zone,time without time zone,text) to authenticated,service_role;
revoke all on function public.clear_my_notification_quiet_hours() from public,anon;
grant execute on function public.clear_my_notification_quiet_hours() to authenticated,service_role;
