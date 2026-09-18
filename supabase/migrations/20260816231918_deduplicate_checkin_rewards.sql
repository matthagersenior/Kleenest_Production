CREATE OR REPLACE FUNCTION public.process_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- The AFTER INSERT gamification trigger is the single authority for check-in
  -- point transactions and streak progression. This BEFORE trigger only sets
  -- the check-in's displayed reward amount and maintains the aggregate count.
  new.points_awarded := 10;
  UPDATE public.profiles
     SET total_check_ins = COALESCE(total_check_ins,0) + 1,
         updated_at = now()
   WHERE id = new.user_id;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kleenest_map_check_in(
  p_location_id uuid,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  cid uuid;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  INSERT INTO public.check_ins(
    user_id, location_id, latitude, longitude, verification_method, metadata
  )
  VALUES (
    uid, p_location_id, p_lat, p_lng, 'gps', jsonb_build_object('source','maps')
  )
  RETURNING id INTO cid;

  SELECT jsonb_build_object(
    'success', true,
    'check_in_id', cid,
    'points_awarded', COALESCE(points_awarded,10)
  ) INTO result
  FROM public.check_ins
  WHERE id = cid;

  RETURN result;
END;
$function$;
