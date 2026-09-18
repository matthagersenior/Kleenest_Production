CREATE OR REPLACE FUNCTION public.process_review_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF tg_op='INSERT' THEN
    UPDATE public.profiles
       SET total_reviews = COALESCE(total_reviews,0) + 1,
           updated_at = now()
     WHERE id = new.user_id;
    RETURN new;
  END IF;
  IF tg_op='DELETE' THEN
    UPDATE public.profiles
       SET total_reviews = greatest(0,COALESCE(total_reviews,0)-1),
           updated_at = now()
     WHERE id = old.user_id;
    RETURN old;
  END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_bathroom_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  awarded integer := 15;
begin
  IF new.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'verification user mismatch';
  END IF;

  UPDATE public.locations
     SET bathroom_verification_count = bathroom_verification_count + 1,
         bathroom_positive_count = bathroom_positive_count + CASE WHEN new.has_public_bathroom THEN 1 ELSE 0 END,
         bathroom_negative_count = bathroom_negative_count + CASE WHEN new.has_public_bathroom THEN 0 ELSE 1 END,
         bathroom_verification_status = CASE WHEN new.has_public_bathroom THEN 'has_bathroom' ELSE 'no_bathroom' END,
         bathroom_verified_at = now(),
         bathroom_verified_by = new.user_id,
         bathroom_verification_source = coalesce(new.verification_method,'user'),
         updated_at = now()
   WHERE id = new.location_id;

  IF new.has_public_bathroom THEN
    INSERT INTO public.location_verification_points(user_id,location_id,points,reason)
    VALUES(new.user_id,new.location_id,awarded,'bathroom_verification')
    ON CONFLICT (user_id,location_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_gamification_activity(
  p_activity text,
  p_reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  u uuid:=auth.uid(); today date:=current_date; s public.user_streaks;
  awarded_points integer; total_points integer:=0; new_level integer:=1;
  activity text:=lower(trim(coalesce(p_activity,''))); inserted boolean:=false;
begin
  if u is null then raise exception 'Authentication required'; end if;
  if activity not in ('check_in','verification','review','favorite','qr_scan','route_completed','route_stop_completed','social_post','social_contribution','share','event_rsvp','contest_entry','location_diversity','community') then
    raise exception 'Unsupported gamification activity: %',activity;
  end if;
  select * into s from public.user_streaks where user_id=u for update;
  if not found then
    insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at)
    values(u,1,1,today,now()) returning * into s;
  elsif s.last_activity_date=today then
    update public.user_streaks set updated_at=now() where user_id=u returning * into s;
  elsif s.last_activity_date=today-1 then
    update public.user_streaks set current_streak=current_streak+1,longest_streak=greatest(longest_streak,current_streak+1),last_activity_date=today,updated_at=now() where user_id=u returning * into s;
  else
    update public.user_streaks set current_streak=1,longest_streak=greatest(longest_streak,1),last_activity_date=today,streak_started_at=now(),updated_at=now() where user_id=u returning * into s;
  end if;
  awarded_points:=case activity
    when 'check_in' then 10
    when 'verification' then 15
    when 'review' then 25
    when 'favorite' then 5
    when 'qr_scan' then 5
    when 'route_completed' then 25
    when 'route_stop_completed' then 5
    when 'social_post' then 5
    when 'social_contribution' then 5
    when 'share' then 3
    when 'event_rsvp' then 3
    when 'contest_entry' then 5
    when 'location_diversity' then 10
    else 5 end;
  if s.current_streak>=7 then awarded_points:=awarded_points+5; end if;
  if p_reference_id is not null then
    insert into public.point_transactions(user_id,points,reason,reference_id)
    values(u,awarded_points,activity,p_reference_id)
    on conflict (user_id,reason,reference_id) where reference_id is not null do nothing;
    inserted:=found;
  else
    insert into public.point_transactions(user_id,points,reason) values(u,awarded_points,activity);
    inserted:=true;
  end if;
  select coalesce(sum(points),0)::integer into total_points from public.point_transactions where user_id=u;
  select coalesce((select level from public.level_definitions where min_points<=total_points and (max_points is null or total_points<=max_points) order by level desc limit 1),1) into new_level;
  update public.profiles set points=total_points,level=new_level,streak=s.current_streak,updated_at=now() where id=u;
  perform public.evaluate_user_badges(u);
  return jsonb_build_object('activity',activity,'awarded_points',case when inserted then awarded_points else 0 end,'points',total_points,'level',new_level,'current_streak',s.current_streak,'longest_streak',s.longest_streak,'new_activity',inserted);
end;
$function$;
