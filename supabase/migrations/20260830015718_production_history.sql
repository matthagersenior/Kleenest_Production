create or replace function public.evaluate_user_badges(p_user_id uuid default auth.uid())
returns integer language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
declare awarded_count integer:=0; checkins integer:=0; reviews integer:=0; distinct_locations integer:=0; pts integer:=0; streak integer:=0; following_count integer:=0; helpful_count integer:=0; amenity_count integer:=0; occupancy_count integer:=0; quest_count integer:=0; cleanliness_count integer:=0; report_count integer:=0; contest_wins integer:=0; user_level integer:=1; reputation numeric:=0; confirmed_count integer:=0; tier text:=''; b record; qualifies boolean; threshold numeric; reward integer;
begin
 if p_user_id is null then raise exception 'Authentication required'; end if;
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Not authorized'; end if;
 select count(*) into checkins from public.check_ins where user_id=p_user_id;
 select count(*) into reviews from public.reviews where user_id=p_user_id and status='published';
 select count(distinct location_id) into distinct_locations from public.check_ins where user_id=p_user_id;
 select coalesce(sum(points),0) into pts from public.point_transactions where user_id=p_user_id;
 select coalesce((select current_streak from public.user_streaks where user_id=p_user_id),0) into streak;
 select count(*) into following_count from public.follows where follower_id=p_user_id;
 select count(*) into helpful_count from public.review_likes l join public.reviews r on r.id=l.review_id where r.user_id=p_user_id;
 select count(*) into amenity_count from public.location_amenity_observations where user_id=p_user_id;
 select count(*) into occupancy_count from public.location_occupancy_observations where user_id=p_user_id;
 select count(*) into quest_count from public.quest_participation where user_id=p_user_id and status='completed';
 select count(*) into cleanliness_count from public.reviews where user_id=p_user_id and cleanliness_pct is not null;
 select count(*) into report_count from public.review_reports where reporter_id=p_user_id;
 select coalesce(sum(quantity),0)::int into contest_wins from public.progression_metric_events where user_id=p_user_id and metric='contest_win';
 select coalesce((select level from public.profiles where id=p_user_id),1),coalesce((select subscription_tier::text from public.profiles where id=p_user_id),'') into user_level,tier;
 select coalesce((select reputation_score from public.contributor_reputation where user_id=p_user_id),0),coalesce((select confirmed_observations_count from public.contributor_reputation where user_id=p_user_id),0) into reputation,confirmed_count;
 for b in select * from public.badges loop
   threshold:=coalesce((b.criteria->>'count')::numeric,0);
   qualifies:=case
     when b.criteria->>'type'='check_ins' then checkins>=threshold
     when b.criteria->>'type'='reviews' then reviews>=threshold
     when b.criteria->>'type' in ('distinct_locations','unique_locations') then distinct_locations>=threshold
     when b.criteria->>'type'='points' then pts>=threshold
     when b.criteria->>'type'='streak' then streak>=threshold
     when b.criteria->>'type'='following' then following_count>=threshold
     when b.criteria->>'type'='helpful_received' then helpful_count>=threshold
     when b.criteria->>'type'='amenity_observations' then amenity_count>=threshold
     when b.criteria->>'type'='occupancy_observations' then occupancy_count>=threshold
     when b.criteria->>'type'='quest_completions' then quest_count>=threshold
     when b.criteria->>'type'='reputation_score' then reputation>=threshold
     when b.criteria->>'type'='confirmed_observations' then confirmed_count>=threshold
     when b.criteria->>'type'='metric' then coalesce((select sum(quantity) from public.progression_metric_events e where e.user_id=p_user_id and e.metric=b.criteria->>'metric'),0)>=threshold
     when b.criteria->>'type'='contest_wins' then contest_wins>=threshold
     when b.criteria ? 'check_ins' then checkins>=coalesce((b.criteria->>'check_ins')::numeric,0)
     when b.criteria ? 'reviews' then reviews>=coalesce((b.criteria->>'reviews')::numeric,0)
     when b.criteria ? 'unique_locations' then distinct_locations>=coalesce((b.criteria->>'unique_locations')::numeric,0)
     when b.criteria ? 'points' then pts>=coalesce((b.criteria->>'points')::numeric,0)
     when b.criteria ? 'streak' then streak>=coalesce((b.criteria->>'streak')::numeric,0)
     when b.criteria ? 'following' then following_count>=coalesce((b.criteria->>'following')::numeric,0)
     when b.criteria ? 'helpful' then helpful_count>=coalesce((b.criteria->>'helpful')::numeric,0)
     when b.criteria ? 'cleanliness_ratings' then cleanliness_count>=coalesce((b.criteria->>'cleanliness_ratings')::numeric,0)
     when b.criteria ? 'reports' then report_count>=coalesce((b.criteria->>'reports')::numeric,0)
     when b.criteria ? 'level' then user_level>=coalesce((b.criteria->>'level')::numeric,0)
     when b.criteria ? 'subscription' then tier=coalesce(b.criteria->>'subscription','')
     when b.criteria ? 'premium' then (tier like '%premium%' or tier like '%family%' or tier like '%fleet%' or tier like '%enterprise%')
     else false end;
   if qualifies then
     insert into public.user_badges(user_id,badge_id) values(p_user_id,b.id) on conflict do nothing;
     if found then
       awarded_count:=awarded_count+1;
       reward:=greatest(coalesce((b.criteria->>'reward_points')::integer,0),0);
       if reward>0 then insert into public.point_transactions(user_id,points,reason,reference_id) values(p_user_id,reward,'badge_reward',b.id) on conflict (user_id,reason,reference_id) where reference_id is not null do nothing; end if;
     end if;
   end if;
 end loop;
 select coalesce(sum(points),0)::int into pts from public.point_transactions where user_id=p_user_id;
 update public.profiles set points=pts,updated_at=now() where id=p_user_id;
 return awarded_count;
end $$;
