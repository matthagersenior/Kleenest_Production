alter table public.notification_preferences
  add column if not exists platform_updates boolean not null default true,
  add column if not exists progression boolean not null default true,
  add column if not exists offers boolean not null default true,
  add column if not exists sponsored boolean not null default false,
  add column if not exists location_alerts boolean not null default true,
  add column if not exists social boolean not null default true,
  add column if not exists personalized_ads boolean not null default false,
  add column if not exists location_based_offers boolean not null default false,
  add column if not exists quiet_hours_start time without time zone,
  add column if not exists quiet_hours_end time without time zone,
  add column if not exists ads_personalization_consent_at timestamptz,
  add column if not exists location_offers_consent_at timestamptz;

create or replace function public.get_my_notification_preferences_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.notification_preferences%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_row from public.notification_preferences where user_id=v_uid;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_my_notification_preferences_v2(
  p_intelligence boolean default null,
  p_rewards boolean default null,
  p_community boolean default null,
  p_push boolean default null,
  p_platform_updates boolean default null,
  p_progression boolean default null,
  p_offers boolean default null,
  p_sponsored boolean default null,
  p_location_alerts boolean default null,
  p_social boolean default null,
  p_personalized_ads boolean default null,
  p_location_based_offers boolean default null,
  p_quiet_hours_start time without time zone default null,
  p_quiet_hours_end time without time zone default null
)
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
  update public.notification_preferences set
    intelligence=coalesce(p_intelligence,intelligence),
    rewards=coalesce(p_rewards,rewards),
    community=coalesce(p_community,community),
    push=coalesce(p_push,push),
    platform_updates=coalesce(p_platform_updates,platform_updates),
    progression=coalesce(p_progression,progression),
    offers=coalesce(p_offers,offers),
    sponsored=coalesce(p_sponsored,sponsored),
    location_alerts=coalesce(p_location_alerts,location_alerts),
    social=coalesce(p_social,social),
    personalized_ads=coalesce(p_personalized_ads,personalized_ads),
    location_based_offers=coalesce(p_location_based_offers,location_based_offers),
    quiet_hours_start=coalesce(p_quiet_hours_start,quiet_hours_start),
    quiet_hours_end=coalesce(p_quiet_hours_end,quiet_hours_end),
    ads_personalization_consent_at=case when p_personalized_ads=true then coalesce(ads_personalization_consent_at,now()) when p_personalized_ads=false then null else ads_personalization_consent_at end,
    location_offers_consent_at=case when p_location_based_offers=true then coalesce(location_offers_consent_at,now()) when p_location_based_offers=false then null else location_offers_consent_at end,
    updated_at=now()
  where user_id=v_uid
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.get_my_notification_preferences_v2() from public, anon;
grant execute on function public.get_my_notification_preferences_v2() to authenticated, service_role;
revoke all on function public.update_my_notification_preferences_v2(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time without time zone,time without time zone) from public, anon;
grant execute on function public.update_my_notification_preferences_v2(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time without time zone,time without time zone) to authenticated, service_role;
