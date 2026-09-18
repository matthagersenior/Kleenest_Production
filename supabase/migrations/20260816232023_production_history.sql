CREATE OR REPLACE FUNCTION public.process_bathroom_verification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
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

  -- Gamification is the single authority for user reward points.
  -- This trigger only maintains location verification state.
  RETURN new;
END;
$function$;
