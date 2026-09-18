create or replace function public.record_gamification_activity(p_activity text, p_reference_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare u uuid:=auth.uid(); today date:=current_date; s public.user_streaks; awarded_points integer; total_points integer:=0; new_level integer:=1; activity text:=lower(trim(coalesce(p_activity,''))); inserted boolean:=false; challenge_reward integer:=0;
begin
 if u is null then raise exception 'Authentication required'; end if;
 if activity not in ('check_in','verification','review','favorite','qr_scan','route_completed','route_stop_completed','social_post','social_contribution','share','event_rsvp','contest_entry','location_diversity','community','challenge_completed') then raise exception 'Unsupported gamification activity: %',activity; end if;
 select * into s from public.user_streaks where user_id=u for update;
 if not found then insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at) values(u,1,1,today,now()) returning * into s;
 elsif s.last_activity_date=today then update public.user_streaks set updated_at=now() where user_id=u returning * into s;
 elsif s.last_activity_date=today-1 then update public.user_streaks set current_streak=current_streak+1,longest_streak=greatest(longest_streak,current_streak+1),last_activity_date=today,updated_at=now() where user_id=u returning * into s;
 else update public.user_streaks set current_streak=1,longest_streak=greatest(longest_streak,1),last_activity_date=today,streak_started_at=now(),updated_at=now() where user_id=u returning * into s; end if;
 if activity='challenge_completed' then select greatest(coalesce(reward_points,0),0) into challenge_reward from public.progression_challenges where id=p_reference_id and enabled=true; if not found then raise exception 'Challenge is unavailable'; end if; awarded_points:=challenge_reward; else awarded_points:=case activity when 'check_in' then 10 when 'verification' then 15 when 'review' then 25 when 'favorite' then 5 when 'qr_scan' then 5 when 'route_completed' then 25 when 'route_stop_completed' then 5 when 'social_post' then 5 when 'social_contribution' then 5 when 'share' then 3 when 'event_rsvp' then 3 when 'contest_entry' then 5 when 'location_diversity' then 10 else 5 end; end if;
 if s.current_streak>=7 then awarded_points:=awarded_points+5; end if;
 if p_reference_id is not null then insert into public.point_transactions(user_id,points,reason,reference_id) values(u,awarded_points,activity,p_reference_id) on conflict (user_id,reason,reference_id) where reference_id is not null do nothing; inserted:=found; else insert into public.point_transactions(user_id,points,reason) values(u,awarded_points,activity); inserted:=true; end if;
 select coalesce(sum(points),0)::integer into total_points from public.point_transactions where user_id=u; select coalesce((select level from public.level_definitions where min_points<=total_points and (max_points is null or total_points<=max_points) order by level desc limit 1),1) into new_level; update public.profiles set points=total_points,level=new_level,streak=s.current_streak,updated_at=now() where id=u; perform public.evaluate_user_badges(u);
 return jsonb_build_object('activity',activity,'awarded_points',case when inserted then awarded_points else 0 end,'points',total_points,'level',new_level,'current_streak',s.current_streak,'longest_streak',s.longest_streak,'new_activity',inserted);
end;$function$;

create or replace function public.complete_progression_challenge(p_challenge_id uuid) returns public.social_challenge_entries language plpgsql security definer set search_path=public,pg_temp as $function$
declare u uuid:=auth.uid(); entry public.social_challenge_entries; challenge public.progression_challenges;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into challenge from public.progression_challenges where id=p_challenge_id and enabled=true for share;
 if not found then raise exception 'Challenge is unavailable'; end if;
 select * into entry from public.social_challenge_entries where challenge_id=p_challenge_id and user_id=u for update;
 if not found then raise exception 'Join the challenge first'; end if;
 if coalesce(entry.progress,0) < challenge.target then raise exception 'Challenge target has not been reached'; end if;
 if entry.completed_at is null then update public.social_challenge_entries set completed_at=now(),updated_at=now() where challenge_id=p_challenge_id and user_id=u returning * into entry; perform public.record_gamification_activity('challenge_completed',p_challenge_id); end if;
 return entry;
end;$function$;
revoke all on function public.complete_progression_challenge(uuid) from public,anon,authenticated;
grant execute on function public.complete_progression_challenge(uuid) to authenticated;
