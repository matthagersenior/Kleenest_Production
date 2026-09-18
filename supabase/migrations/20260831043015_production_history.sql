create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'intelligence',coalesce(np.intelligence,true),
    'rewards',coalesce(np.rewards,true),
    'community',coalesce(np.community,true),
    'push',coalesce(np.push,true)
  ) into v_result
  from (select 1) seed
  left join public.notification_preferences np on np.user_id=v_user;
  return coalesce(v_result,jsonb_build_object('intelligence',true,'rewards',true,'community',true,'push',true));
end;
$$;

create or replace function public.update_my_notification_preferences(
  p_intelligence boolean default null,
  p_rewards boolean default null,
  p_community boolean default null,
  p_push boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_row public.notification_preferences;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id,intelligence,rewards,community,push,updated_at)
  values(v_user,coalesce(p_intelligence,true),coalesce(p_rewards,true),coalesce(p_community,true),coalesce(p_push,true),now())
  on conflict(user_id) do update set
    intelligence=coalesce(p_intelligence,public.notification_preferences.intelligence),
    rewards=coalesce(p_rewards,public.notification_preferences.rewards),
    community=coalesce(p_community,public.notification_preferences.community),
    push=coalesce(p_push,public.notification_preferences.push),
    updated_at=now()
  returning * into v_row;
  return jsonb_build_object('intelligence',v_row.intelligence,'rewards',v_row.rewards,'community',v_row.community,'push',v_row.push);
end;
$$;

create or replace function public.enqueue_notification_native_push_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare worker_secret text;
begin
  if coalesce((select np.push from public.notification_preferences np where np.user_id=new.user_id),true)
     and exists(select 1 from public.notification_native_push_tokens t where t.user_id=new.user_id and t.active=true)
  then
    select c.worker_secret into worker_secret from internal.push_worker_config c where c.id=true;
    perform net.http_post(
      url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/deliver-native-push-notification',
      headers:=jsonb_build_object('Content-Type','application/json','x-kleenest-worker-secret',worker_secret),
      body:=jsonb_build_object('record',jsonb_build_object('id',new.id)),
      timeout_milliseconds:=5000
    );
  end if;
  return new;
end;
$$;

revoke all on function public.get_my_notification_preferences() from public,anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
revoke all on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.update_my_notification_preferences(boolean,boolean,boolean,boolean) to authenticated;
revoke all on function public.enqueue_notification_native_push_delivery() from public,anon,authenticated;
