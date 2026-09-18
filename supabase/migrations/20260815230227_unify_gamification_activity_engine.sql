create unique index if not exists point_transactions_user_reason_reference_uidx on public.point_transactions(user_id, reason, reference_id) where reference_id is not null;

create or replace function public.record_gamification_activity(p_activity text, p_reference_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid := auth.uid();
  today date := current_date;
  s public.user_streaks;
  awarded_points integer := 0;
  total_points integer := 0;
  new_level integer := 1;
  activity text := lower(trim(coalesce(p_activity,'')));
  inserted boolean := false;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if activity not in ('check_in','verification','review','favorite','qr_scan','route_completed','route_stop_completed','social_post','social_contribution','share','event_rsvp','promotion_redeemed','contest_entry','location_diversity','community') then
    raise exception 'Unsupported gamification activity: %', activity;
  end if;

  select * into s from public.user_streaks where user_id=u for update;
  if not found then
    insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at)
    values(u,1,1,today,now()) returning * into s;
  else
    if s.last_activity_date=today then
      update public.user_streaks set updated_at=now() where user_id=u returning * into s;
    elsif s.last_activity_date=today-1 then
      update public.user_streaks set current_streak=current_streak+1,longest_streak=greatest(longest_streak,current_streak+1),last_activity_date=today,updated_at=now() where user_id=u returning * into s;
    else
      update public.user_streaks set current_streak=1,longest_streak=greatest(longest_streak,1),last_activity_date=today,streak_started_at=now(),updated_at=now() where user_id=u returning * into s;
    end if;
  end if;

  awarded_points := case activity
    when 'check_in' then 10
    when 'verification' then 15
    when 'review' then 20
    when 'favorite' then 5
    when 'qr_scan' then 5
    when 'route_completed' then 25
    when 'route_stop_completed' then 5
    when 'social_post' then 5
    when 'social_contribution' then 5
    when 'share' then 3
    when 'event_rsvp' then 3
    when 'promotion_redeemed' then 10
    when 'contest_entry' then 5
    when 'location_diversity' then 10
    else 5
  end;
  if s.current_streak >= 7 then awarded_points := awarded_points + 5; end if;

  if p_reference_id is not null then
    insert into public.point_transactions(user_id,points,reason,reference_id)
    values(u,awarded_points,activity,p_reference_id)
    on conflict (user_id,reason,reference_id) where reference_id is not null do nothing;
    inserted := found;
  else
    insert into public.point_transactions(user_id,points,reason,reference_id)
    values(u,awarded_points,activity,null);
    inserted := true;
  end if;

  select coalesce(sum(points),0)::integer into total_points from public.point_transactions where user_id=u;
  select coalesce((select level from public.level_definitions where min_points <= total_points and (max_points is null or total_points <= max_points) order by level desc limit 1),1) into new_level;
  update public.profiles set points=total_points,level=new_level,streak=s.current_streak,updated_at=now() where id=u;
  perform public.evaluate_user_badges(u);

  return jsonb_build_object('activity',activity,'awarded_points',case when inserted then awarded_points else 0 end,'points',total_points,'level',new_level,'current_streak',s.current_streak,'longest_streak',s.longest_streak,'new_activity',inserted);
end;
$$;

create or replace function public.gamification_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if auth.uid() is null then return new; end if;
  if TG_TABLE_NAME='check_ins' then
    perform public.record_gamification_activity('check_in', new.id);
    if not exists (select 1 from public.check_ins where user_id=new.user_id and location_id=new.location_id and id<>new.id) then
      perform public.record_gamification_activity('location_diversity', new.location_id);
    end if;
  elsif TG_TABLE_NAME='location_bathroom_verifications' then
    perform public.record_gamification_activity('verification', new.id);
  elsif TG_TABLE_NAME='reviews' then
    perform public.record_gamification_activity('review', new.id);
  elsif TG_TABLE_NAME='favorites' then
    perform public.record_gamification_activity('favorite', new.location_id);
  elsif TG_TABLE_NAME='social_posts' then
    perform public.record_gamification_activity('social_post', new.id);
  elsif TG_TABLE_NAME='contest_entries' then
    perform public.record_gamification_activity('contest_entry', new.contest_id);
  elsif TG_TABLE_NAME='promotion_redemptions' then
    perform public.record_gamification_activity('promotion_redeemed', new.id);
  elsif TG_TABLE_NAME='route_events' then
    if new.event_type='route_completed' then perform public.record_gamification_activity('route_completed', new.route_id);
    elsif new.event_type='stop_completed' then perform public.record_gamification_activity('route_stop_completed', new.route_stop_id);
    elsif new.event_type='route_shared' then perform public.record_gamification_activity('share', new.route_id); end if;
  elsif TG_TABLE_NAME='analytics_events' then
    if new.event_type='qr_scan' then perform public.record_gamification_activity('qr_scan', new.id);
    elsif new.event_type='event_rsvp' then perform public.record_gamification_activity('event_rsvp', new.event_id);
    elsif new.event_type='share' then perform public.record_gamification_activity('share', new.id); end if;
  end if;
  return new;
exception when others then
  raise warning 'gamification trigger skipped: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.record_gamification_activity(text,uuid) from public, anon;
grant execute on function public.record_gamification_activity(text,uuid) to authenticated;
revoke all on function public.gamification_activity_trigger() from public, anon, authenticated;

drop trigger if exists gamification_check_ins on public.check_ins;
create trigger gamification_check_ins after insert on public.check_ins for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_verifications on public.location_bathroom_verifications;
create trigger gamification_verifications after insert on public.location_bathroom_verifications for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_reviews on public.reviews;
create trigger gamification_reviews after insert on public.reviews for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_favorites on public.favorites;
create trigger gamification_favorites after insert on public.favorites for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_social_posts on public.social_posts;
create trigger gamification_social_posts after insert on public.social_posts for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_contest_entries on public.contest_entries;
create trigger gamification_contest_entries after insert on public.contest_entries for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_promotion_redemptions on public.promotion_redemptions;
create trigger gamification_promotion_redemptions after insert on public.promotion_redemptions for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_route_events on public.route_events;
create trigger gamification_route_events after insert on public.route_events for each row execute function public.gamification_activity_trigger();
drop trigger if exists gamification_analytics_events on public.analytics_events;
create trigger gamification_analytics_events after insert on public.analytics_events for each row execute function public.gamification_activity_trigger();
