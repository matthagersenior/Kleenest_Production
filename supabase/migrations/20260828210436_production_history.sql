create or replace function public.record_gamification_activity(p_activity text, p_reference_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare
 u uuid:=auth.uid(); today date:=current_date; s public.user_streaks; awarded_points integer; total_points integer:=0; new_level integer:=1; activity text:=lower(trim(coalesce(p_activity,''))); inserted boolean:=false; challenge_reward integer:=0; v_location uuid; v_checkin uuid; v_checkin_at timestamptz; v_eligible boolean:=true; v_daily integer:=0;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if activity not in ('check_in','verification','review','favorite','qr_scan','route_completed','route_stop_completed','social_post','social_contribution','share','event_rsvp','contest_entry','location_diversity','community','challenge_completed') then raise exception 'Unsupported gamification activity: %',activity; end if;
 if activity in ('check_in','review') then
  perform pg_advisory_xact_lock(hashtextextended('kleenest:progression:'||u::text,0));
  if activity='check_in' then
   select c.location_id,c.checked_in_at into v_location,v_checkin_at from public.check_ins c where c.id=p_reference_id and c.user_id=u;
   v_checkin:=p_reference_id;
   if v_checkin is null then v_eligible:=false; end if;
  else
   select r.location_id,r.check_in_id,c.checked_in_at into v_location,v_checkin,v_checkin_at from public.reviews r left join public.check_ins c on c.id=r.check_in_id and c.user_id=u where r.id=p_reference_id and r.user_id=u;
   if p_reference_id is not null and exists(select 1 from public.point_transactions pt where pt.user_id=u and pt.reason='review' and pt.reference_id=p_reference_id) then v_eligible:=false; end if;
  end if;
  if v_location is null or v_checkin_at is null then v_eligible:=false; end if;
  if activity='check_in' and v_eligible then
   if exists(select 1 from public.point_transactions pt where pt.user_id=u and pt.reason='check_in' and pt.reference_id=v_checkin) then v_eligible:=false; end if;
  end if;
  if v_eligible then
   if exists(select 1 from public.check_ins c where c.user_id=u and c.location_id=v_location and c.checked_in_at < v_checkin_at and not exists(select 1 from public.location_departures d where d.user_id=u and d.location_id=v_location and d.left_at > c.checked_in_at and d.left_at <= v_checkin_at)) then v_eligible:=false; end if;
  end if;
  select count(*)::integer into v_daily from public.point_transactions where user_id=u and reason in ('check_in','review') and created_at >= date_trunc('day',v_checkin_at) and created_at < date_trunc('day',v_checkin_at)+interval '1 day';
  if v_daily>=5 then v_eligible:=false; end if;
  if not v_eligible then return jsonb_build_object('activity',activity,'awarded_points',0,'new_activity',false,'reason',case when v_daily>=5 then 'daily_progression_cap_reached' else 'progression_not_eligible' end); end if;
 end if;
 select * into s from public.user_streaks where user_id=u for update;
 if not found then insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at) values(u,1,1,today,now()) returning * into s;
 elsif s.last_activity_date=today then update public.user_streaks set updated_at=now() where user_id=u returning * into s;
 elsif s.last_activity_date=today-1 then update public.user_streaks set current_streak=current_streak+1,longest_streak=greatest(longest_streak,current_streak+1),last_activity_date=today,updated_at=now() where user_id=u returning * into s;
 else update public.user_streaks set current_streak=1,longest_streak=greatest(longest_streak,1),last_activity_date=today,streak_started_at=now(),updated_at=now() where user_id=u returning * into s; end if;
 if activity='challenge_completed' then select greatest(coalesce(reward_points,0),0) into challenge_reward from public.progression_challenges where id=p_reference_id and enabled=true; if not found then raise exception 'Challenge is unavailable'; end if; awarded_points:=challenge_reward;
 else awarded_points:=case activity when 'check_in' then 10 when 'verification' then 15 when 'review' then 25 when 'favorite' then 5 when 'qr_scan' then 5 when 'route_completed' then 25 when 'route_stop_completed' then 5 when 'social_post' then 5 when 'social_contribution' then 5 when 'share' then 3 when 'event_rsvp' then 3 when 'contest_entry' then 5 when 'location_diversity' then 10 else 5 end; end if;
 if s.current_streak>=7 then awarded_points:=awarded_points+5; end if;
 if p_reference_id is not null then insert into public.point_transactions(user_id,points,reason,reference_id) values(u,awarded_points,activity,p_reference_id) on conflict (user_id,reason,reference_id) where reference_id is not null do nothing; inserted:=found;
 else insert into public.point_transactions(user_id,points,reason) values(u,awarded_points,activity); inserted:=true; end if;
 select coalesce(sum(points),0)::integer into total_points from public.point_transactions where user_id=u;
 select coalesce((select level from public.level_definitions where min_points<=total_points and (max_points is null or total_points<=max_points) order by level desc limit 1),1) into new_level;
 update public.profiles set points=total_points,level=new_level,streak=s.current_streak,updated_at=now() where id=u;
 perform public.evaluate_user_badges(u);
 return jsonb_build_object('activity',activity,'awarded_points',case when inserted then awarded_points else 0 end,'points',total_points,'level',new_level,'current_streak',s.current_streak,'longest_streak',s.longest_streak,'new_activity',inserted);
end;
$$;
