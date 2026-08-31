create table if not exists internal.notification_preference_suppressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  preference_category text not null check (preference_category in ('community','rewards','intelligence')),
  created_at timestamptz not null default now()
);
create index if not exists notification_preference_suppressions_user_created_idx on internal.notification_preference_suppressions(user_id,created_at desc);

create or replace function internal.enforce_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_allowed boolean:=true;
  v_type text:=lower(coalesce(new.type,''));
begin
  if v_type in ('new_follower','review_helpful','business_review_reply') or v_type like 'community_%' or v_type like 'follow_%' then
    v_category:='community';
    select coalesce(np.community,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_type='game_challenge' or v_type like 'badge%' or v_type like 'quest%' or v_type like 'contest%' or v_type like 'progress%' or v_type like 'reward%' then
    v_category:='rewards';
    select coalesce(np.rewards,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  elsif v_type in ('trusted_place','popular_place','operational_attention','demand_opportunity','high_activity_zone') or v_type like 'intelligence_%' then
    v_category:='intelligence';
    select coalesce(np.intelligence,true) into v_allowed from (select 1) seed left join public.notification_preferences np on np.user_id=new.user_id;
  else
    return new;
  end if;

  if coalesce(v_allowed,true) then return new; end if;
  insert into internal.notification_preference_suppressions(user_id,notification_type,preference_category)
  values(new.user_id,new.type,v_category);
  return null;
end;
$$;

revoke all on function internal.enforce_notification_preferences() from public,anon,authenticated;
revoke all on table internal.notification_preference_suppressions from public,anon,authenticated;

drop trigger if exists notifications_enforce_preferences on public.notifications;
create trigger notifications_enforce_preferences before insert on public.notifications for each row execute function internal.enforce_notification_preferences();
