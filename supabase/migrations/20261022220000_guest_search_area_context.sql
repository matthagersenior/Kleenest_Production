-- Give platform-owner Guest Insights enough context to diagnose discovery quality
-- while keeping raw search phrases and precise coordinates out of the guest event log.
CREATE OR REPLACE FUNCTION public.record_guest_journey_event(
  p_session_id text,
  p_visitor_key text,
  p_event_name text,
  p_location_id uuid DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_name text := lower(trim(coalesce(p_event_name,'')));
  v_context jsonb := CASE WHEN jsonb_typeof(p_context)='object' THEN p_context ELSE '{}'::jsonb END;
  v_uid uuid := auth.uid();
  v_area text := v_context->>'area_cell';
  v_lat numeric;
  v_lon numeric;
BEGIN
  -- Never treat a registered account as a guest.
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id=v_uid AND NOT coalesce(u.is_anonymous,false)
  ) THEN RETURN; END IF;
  IF p_session_id IS NULL OR p_session_id !~ '^[a-zA-Z0-9-]{20,80}$'
     OR p_visitor_key IS NULL OR p_visitor_key !~ '^[a-zA-Z0-9-]{18,140}$'
  THEN RAISE EXCEPTION 'GUEST_JOURNEY_ID_INVALID'; END IF;
  IF v_name NOT IN (
    'landing_view','install_intent','install_success','apk_download','continue_guest',
    'signup_intent','signin_intent','open_app','share',
    'app_open','nearby_results_shown','discovery_intent_applied','place_selected',
    'navigation_started','arrival_detected','review_started','review_submit_attempt',
    'review_submit_success','review_submit_failed','review_photo_added','review_done',
    'search_failed','no_results'
  ) THEN RAISE EXCEPTION 'GUEST_JOURNEY_EVENT_INVALID'; END IF;
  IF (SELECT count(*) FROM private.guest_journey_events
      WHERE session_id=p_session_id AND occurred_at>now()-interval '1 minute')>=90
  THEN RETURN; END IF;

  IF v_area ~ '^-?[0-9]{1,3}\.[0-9]{2},-?[0-9]{1,3}\.[0-9]{2}$' THEN
    v_lat := split_part(v_area,',',1)::numeric;
    v_lon := split_part(v_area,',',2)::numeric;
    IF v_lat NOT BETWEEN -90 AND 90 OR v_lon NOT BETWEEN -180 AND 180 THEN v_area := NULL; END IF;
  ELSE
    v_area := NULL;
  END IF;

  INSERT INTO private.guest_journey_events(session_id,visitor_key,event_name,location_id,context)
  VALUES(p_session_id,p_visitor_key,v_name,p_location_id,
    jsonb_strip_nulls(jsonb_build_object(
      'surface',nullif(left(coalesce(v_context->>'surface',''),32),''),
      'source',nullif(left(coalesce(v_context->>'source',''),50),''),
      'method',nullif(left(coalesce(v_context->>'method',''),32),''),
      'device_kind',nullif(left(coalesce(v_context->>'device_kind',''),24),''),
      'browser_kind',nullif(left(coalesce(v_context->>'browser_kind',''),24),''),
      'result_count',CASE WHEN v_context->>'resultCount' ~ '^[0-9]{1,7}$'
        THEN least((v_context->>'resultCount')::integer,100000) ELSE NULL END,
      'radius_meters',CASE WHEN v_context->>'radiusMeters' ~ '^[0-9]{1,7}$'
        THEN least((v_context->>'radiusMeters')::integer,50000) ELSE NULL END,
      'search_present',CASE WHEN v_context ? 'search'
        THEN (v_context->>'search' NOT IN ('','false','null')) ELSE NULL END,
      'search_kind',CASE WHEN v_context->>'search_kind' IN ('nearby','place_or_business','address_or_area')
        THEN v_context->>'search_kind' ELSE NULL END,
      'area_cell',v_area,
      'filters',(SELECT coalesce(jsonb_agg(filter_value),'[]'::jsonb)
        FROM (SELECT left(value,40) AS filter_value
          FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_context->'filters')='array'
            THEN v_context->'filters' ELSE '[]'::jsonb END) AS supplied(value)
          WHERE value ~ '^[A-Za-z0-9 ''’-]{1,40}$' LIMIT 12) safe_filters),
      'filter_count',(SELECT least(count(*),12)::integer
        FROM (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_context->'filters')='array'
          THEN v_context->'filters' ELSE '[]'::jsonb END) AS supplied(value)
          WHERE value ~ '^[A-Za-z0-9 ''’-]{1,40}$' LIMIT 12) safe_filters)
    ))
  );

  UPDATE private.guest_journey_housekeeping SET last_pruned_at=now()
  WHERE singleton=true AND last_pruned_at<now()-interval '1 day';
  IF FOUND THEN
    DELETE FROM private.guest_journey_events WHERE occurred_at<now()-interval '30 days';
    DELETE FROM private.guest_journey_conversions WHERE converted_at<now()-interval '30 days';
  END IF;
END;
$function$;

-- The privacy notice now describes coarse discovery-area and filter metadata.
CREATE OR REPLACE FUNCTION public.current_policy_versions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'terms','2026-09-01',
    'community','2026-09-01',
    'privacy','2026-10-22'
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_current_policy_acceptance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.policy_acceptances p
    WHERE p.user_id=auth.uid()
      AND p.terms_version='2026-09-01'
      AND p.community_version='2026-09-01'
      AND p.privacy_version='2026-10-22'
  );
$function$;

CREATE OR REPLACE FUNCTION public.accept_current_policies()
RETURNS public.policy_acceptances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row public.policy_acceptances;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.policy_acceptances(user_id,terms_version,community_version,privacy_version,accepted_at)
  VALUES(auth.uid(),'2026-09-01','2026-09-01','2026-10-22',now())
  ON CONFLICT(user_id) DO UPDATE SET terms_version=excluded.terms_version,
    community_version=excluded.community_version,privacy_version=excluded.privacy_version,
    accepted_at=excluded.accepted_at
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
