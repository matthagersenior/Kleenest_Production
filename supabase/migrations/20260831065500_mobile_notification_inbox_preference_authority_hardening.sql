create or replace function internal.notification_preference_category(p_type text,p_data jsonb default '{}'::jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_type,'')) like 'support%' or coalesce(p_data,'{}'::jsonb) ? 'support_request_id' then null
    when lower(coalesce(p_type,'')) in ('review','new_follower','review_helpful','business_review_reply')
      or lower(coalesce(p_type,'')) like 'community_%'
      or lower(coalesce(p_type,'')) like 'follow_%'
      or lower(coalesce(p_type,'')) like 'review_%'
      or lower(coalesce(p_type,'')) like '%reply%' then 'community'
    when lower(coalesce(p_type,''))='game_challenge'
      or lower(coalesce(p_type,'')) like 'badge%'
      or lower(coalesce(p_type,'')) like 'quest%'
      or lower(coalesce(p_type,'')) like 'contest%'
      or lower(coalesce(p_type,'')) like 'progress%'
      or lower(coalesce(p_type,'')) like 'reward%' then 'rewards'
    when lower(coalesce(p_type,'')) in ('scheduled_report','trusted_place','popular_place','operational_attention','demand_opportunity','high_activity_zone')
      or lower(coalesce(p_type,'')) like 'intelligence_%'
      or lower(coalesce(p_type,'')) like 'report_%' then 'intelligence'
    else null
  end;
$$;
revoke all on function internal.notification_preference_category(text,jsonb) from public,anon,authenticated;

create or replace function internal.enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_allowed boolean := true;
begin
  v_category := internal.notification_preference_category(new.type,coalesce(new.data,'{}'::jsonb));
  if v_category is null then return new; end if;
  if v_category='community' then
    select coalesce(np.community,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='rewards' then
    select coalesce(np.rewards,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_category='intelligence' then
    select coalesce(np.intelligence,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  end if;
  if coalesce(v_allowed,true) then return new; end if;
  insert into internal.notification_preference_suppressions(user_id,notification_type,preference_category)
  values(new.user_id,new.type,v_category);
  return null;
end;
$$;
revoke all on function internal.enforce_notification_preferences() from public,anon,authenticated;

create or replace function public.user_notifications(p_limit integer default 50)
returns setof public.notifications
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  return query select n.* from public.notifications n where n.user_id=v_user order by n.created_at desc limit v_limit;
end;
$$;
revoke all on function public.user_notifications(integer) from public,anon;
grant execute on function public.user_notifications(integer) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.notifications set read_at=coalesce(read_at,pg_catalog.now()) where id=p_notification_id and user_id=v_user;
  return found;
end;
$$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_affected integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.notifications set read_at=coalesce(read_at,pg_catalog.now()) where user_id=v_user and read_at is null;
  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;
revoke all on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.my_notification_preference_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select pg_catalog.jsonb_build_object(
    'preferences',pg_catalog.jsonb_build_object('intelligence',coalesce(np.intelligence,true),'rewards',coalesce(np.rewards,true),'community',coalesce(np.community,true),'push',coalesce(np.push,true)),
    'suppressed_30d',pg_catalog.jsonb_build_object('community',count(*) filter(where s.preference_category='community'),'rewards',count(*) filter(where s.preference_category='rewards'),'intelligence',count(*) filter(where s.preference_category='intelligence'),'total',count(s.id))
  ) into v_result
  from (select 1) seed
  left join public.notification_preferences np on np.user_id=v_user
  left join internal.notification_preference_suppressions s on s.user_id=v_user and s.created_at>=pg_catalog.now()-interval '30 days'
  group by np.intelligence,np.rewards,np.community,np.push;
  return coalesce(v_result,pg_catalog.jsonb_build_object('preferences',pg_catalog.jsonb_build_object('intelligence',true,'rewards',true,'community',true,'push',true),'suppressed_30d',pg_catalog.jsonb_build_object('community',0,'rewards',0,'intelligence',0,'total',0)));
end;
$$;
revoke all on function public.my_notification_preference_status() from public,anon;
grant execute on function public.my_notification_preference_status() to authenticated;

revoke all on table public.notification_preferences from authenticated;
revoke select on table public.notifications from authenticated;
