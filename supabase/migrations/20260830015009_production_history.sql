insert into public.progression_actions(code,label,points,enabled)
values ('occupancy_observation','Verified occupancy observation',10,true)
on conflict(code) do update set label=excluded.label,points=excluded.points,enabled=true;

create or replace function public.submit_location_occupancy_observation(p_location_id uuid,p_occupancy_count integer,p_capacity_count integer default null,p_queue_count integer default null,p_wait_minutes numeric default null,p_confidence numeric default 0.75,p_observation_method text default 'user',p_check_in_id uuid default null,p_metadata jsonb default '{}'::jsonb)
returns public.location_occupancy_observations language plpgsql security invoker set search_path to 'public','auth','extensions','pg_temp' as $$
declare r public.location_occupancy_observations; v_check public.check_ins%rowtype; v_key text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.locations where id=p_location_id and is_active=true) then raise exception 'Canonical location not found or inactive'; end if;
 if p_occupancy_count<0 or p_occupancy_count>10000 then raise exception 'Occupancy count out of range'; end if;
 if p_capacity_count is not null and (p_capacity_count<=0 or p_capacity_count>10000) then raise exception 'Capacity count out of range'; end if;
 if p_queue_count is not null and (p_queue_count<0 or p_queue_count>10000) then raise exception 'Queue count out of range'; end if;
 if p_wait_minutes is not null and (p_wait_minutes<0 or p_wait_minutes>1440) then raise exception 'Wait time out of range'; end if;
 if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'Confidence out of range'; end if;
 if p_check_in_id is not null then
   select * into v_check from public.check_ins where id=p_check_in_id and user_id=auth.uid() and location_id=p_location_id;
   if not found then raise exception 'Check-in does not belong to this user and canonical location'; end if;
 end if;
 insert into public.location_occupancy_observations(location_id,user_id,check_in_id,occupancy_count,capacity_count,queue_count,wait_minutes,confidence,observation_method,metadata)
 values(p_location_id,auth.uid(),p_check_in_id,p_occupancy_count,p_capacity_count,p_queue_count,p_wait_minutes,p_confidence,coalesce(nullif(trim(p_observation_method),''),'user'),coalesce(p_metadata,'{}'::jsonb)) returning * into r;
 if p_check_in_id is not null then
   v_key:=md5(concat_ws('|',auth.uid()::text,'occupancy_observation',p_check_in_id::text,p_location_id::text));
   perform public.record_progression_metric_event('occupancy_observation','occupancy_observation',r.id,1,null,jsonb_build_object('idempotency_key',v_key,'location_id',p_location_id,'check_in_id',p_check_in_id,'server_authoritative',true));
 end if;
 return r;
end $$;

insert into public.badges(code,name,description,icon,criteria) values
('trust-first-visit','First Trusted Visit','Complete your first verified visit.','📍','{"type":"check_ins","count":1,"reward_points":10}'::jsonb),
('trust-regular','Trusted Regular','Complete 10 verified visits.','✅','{"type":"check_ins","count":10,"reward_points":40}'::jsonb),
('trust-road-warrior','Road Warrior','Complete 50 verified visits.','🛣️','{"type":"check_ins","count":50,"reward_points":100}'::jsonb),
('review-first-hand','First-Hand Reviewer','Publish your first verified review.','⭐','{"type":"reviews","count":1,"reward_points":10}'::jsonb),
('review-field-guide','Field Guide','Publish 10 verified reviews.','📖','{"type":"reviews","count":10,"reward_points":50}'::jsonb),
('review-community-trusted','Community Trusted Reviewer','Receive 25 helpful votes across your reviews.','👍','{"type":"helpful_received","count":25,"reward_points":75}'::jsonb),
('amenity-scout','Amenity Scout','Record 5 amenity observations.','🔎','{"type":"amenity_observations","count":5,"reward_points":25}'::jsonb),
('amenity-auditor','Amenity Auditor','Record 25 amenity observations.','🧾','{"type":"amenity_observations","count":25,"reward_points":75}'::jsonb),
('occupancy-scout','Occupancy Scout','Submit 5 occupancy measurements.','👥','{"type":"occupancy_observations","count":5,"reward_points":25}'::jsonb),
('occupancy-signal-pro','Occupancy Signal Pro','Submit 25 occupancy measurements.','📊','{"type":"occupancy_observations","count":25,"reward_points":75}'::jsonb),
('freshness-keeper','Freshness Keeper','Contribute 10 verification events.','🕒','{"type":"metric","metric":"verification","count":10,"reward_points":50}'::jsonb),
('quest-finisher','Quest Finisher','Complete your first Trust Quest.','🏁','{"type":"quest_completions","count":1,"reward_points":25}'::jsonb),
('quest-veteran','Quest Veteran','Complete 10 Trust Quests.','🏆','{"type":"quest_completions","count":10,"reward_points":100}'::jsonb),
('community-connector','Community Connector','Follow 10 contributors.','🤝','{"type":"following","count":10,"reward_points":30}'::jsonb),
('trusted-contributor','Trusted Contributor','Reach a contributor reputation score of 50.','🛡️','{"type":"reputation_score","count":50,"reward_points":50}'::jsonb),
('verified-contributor','Verified Contributor','Reach 25 confirmed observations.','🔐','{"type":"confirmed_observations","count":25,"reward_points":100}'::jsonb),
('streak-seven','Seven-Day Streak','Maintain a 7-day activity streak.','🔥','{"type":"streak","count":7,"reward_points":35}'::jsonb),
('streak-thirty','Thirty-Day Streak','Maintain a 30-day activity streak.','🌟','{"type":"streak","count":30,"reward_points":150}'::jsonb),
('explorer-25','Explorer 25','Verify visits at 25 distinct locations.','🧭','{"type":"distinct_locations","count":25,"reward_points":100}'::jsonb),
('points-1000','Kleenest 1000','Earn 1,000 progression points.','💎','{"type":"points","count":1000,"reward_points":100}'::jsonb)
on conflict(code) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,criteria=excluded.criteria;

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
 select coalesce(current_streak,0) into streak from public.user_streaks where user_id=p_user_id;
 select count(*) into following_count from public.follows where follower_id=p_user_id;
 select count(*) into helpful_count from public.review_likes l join public.reviews r on r.id=l.review_id where r.user_id=p_user_id;
 select count(*) into amenity_count from public.location_amenity_observations where user_id=p_user_id;
 select count(*) into occupancy_count from public.location_occupancy_observations where user_id=p_user_id;
 select count(*) into quest_count from public.quest_participation where user_id=p_user_id and status='completed';
 select count(*) into cleanliness_count from public.reviews where user_id=p_user_id and cleanliness_pct is not null;
 select count(*) into report_count from public.review_reports where reporter_id=p_user_id;
 select coalesce(sum(quantity),0)::int into contest_wins from public.progression_metric_events where user_id=p_user_id and metric='contest_win';
 select coalesce(level,1),coalesce(subscription_tier::text,''),coalesce(points,pts) into user_level,tier,pts from public.profiles where id=p_user_id;
 select coalesce(reputation_score,0),coalesce(confirmed_observations_count,0) into reputation,confirmed_count from public.contributor_reputation where user_id=p_user_id;
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
       if reward>0 then
         insert into public.point_transactions(user_id,points,reason,reference_id) values(p_user_id,reward,'badge_reward',b.id)
         on conflict (user_id,reason,reference_id) where reference_id is not null do nothing;
       end if;
     end if;
   end if;
 end loop;
 select coalesce(sum(points),0)::int into pts from public.point_transactions where user_id=p_user_id;
 update public.profiles set points=pts,updated_at=now() where id=p_user_id;
 return awarded_count;
end $$;
