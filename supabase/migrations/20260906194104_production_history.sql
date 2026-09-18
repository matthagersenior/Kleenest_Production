create or replace function public.register_notification_native_push_token(
  p_token text,
  p_platform text,
  p_app_id text default 'com.kleenest.app'
) returns public.notification_native_push_tokens
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.notification_native_push_tokens;
  normalized_token text := pg_catalog.btrim(p_token);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if nullif(normalized_token, '') is null then
    raise exception 'Push token is required';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Unsupported push platform';
  end if;
  if normalized_token !~ '^Expo(nent)?PushToken\[[^]]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  insert into public.notification_native_push_tokens(
    user_id, token, provider, platform, app_id, active, updated_at
  ) values (
    auth.uid(), normalized_token, 'expo', p_platform,
    coalesce(nullif(pg_catalog.btrim(p_app_id), ''), 'com.kleenest.app'), true, pg_catalog.now()
  )
  on conflict(user_id, token) do update
    set platform = excluded.platform,
        app_id = excluded.app_id,
        active = true,
        updated_at = pg_catalog.now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.register_notification_native_push_token(text,text,text) from public, anon;
grant execute on function public.register_notification_native_push_token(text,text,text) to authenticated;
