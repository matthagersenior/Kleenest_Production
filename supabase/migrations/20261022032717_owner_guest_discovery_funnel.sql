-- Owner-only guest Discovery funnel. Denominator: tracked guest app launches;
-- automatic nearby results are distinguished from deliberate user interactions.
-- Uses private, bounded first-party events. No IPs, search phrases or fingerprinting.
CREATE OR REPLACE FUNCTION private.owner_guest_discovery_funnel(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_days integer := CASE WHEN p_days=30 THEN 30 ELSE 7 END;
  v_since timestamptz := now()-make_interval(days=>CASE WHEN p_days=30 THEN 30 ELSE 7 END);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
    RAISE EXCEPTION 'platform owner access required';
  END IF;
  RETURN (
    WITH per_session AS (
      SELECT e.visitor_key,e.session_id,
        bool_or(e.event_name='app_open') app_opened,
        bool_or(e.event_name='continue_guest') guest_entry,
        bool_or(e.event_name='nearby_results_shown') results_shown,
        bool_or(e.event_name='nearby_results_shown' AND e.context->>'search_present'='true') used_search,
        bool_or(e.event_name='discovery_intent_applied') applied_filters,
        bool_or(e.event_name='place_selected') selected_place,
        bool_or(e.event_name='navigation_started') started_navigation,
        bool_or(e.event_name='no_results' OR
          (e.event_name='nearby_results_shown' AND e.context->>'result_count'='0')) zero_results
      FROM private.guest_journey_events e
      WHERE e.occurred_at>=v_since GROUP BY e.visitor_key,e.session_id
    ),
    per_visitor AS (
      SELECT visitor_key,bool_or(guest_entry) entered_as_guest,
        bool_or(results_shown OR used_search OR applied_filters OR selected_place OR started_navigation) discovered,
        count(*) FILTER(WHERE app_opened) app_sessions
      FROM per_session GROUP BY visitor_key
    ),
    totals AS (
      SELECT
        count(*) FILTER(WHERE app_opened) app_sessions,
        count(*) FILTER(WHERE app_opened AND results_shown) results_sessions,
        count(*) FILTER(WHERE app_opened AND (results_shown OR used_search OR applied_filters OR selected_place OR started_navigation)) discovery_sessions,
        count(*) FILTER(WHERE app_opened AND (used_search OR applied_filters OR selected_place OR started_navigation)) intentional_sessions,
        count(*) FILTER(WHERE app_opened AND used_search) search_sessions,
        count(*) FILTER(WHERE app_opened AND applied_filters) filtered_sessions,
        count(*) FILTER(WHERE app_opened AND selected_place) selected_sessions,
        count(*) FILTER(WHERE app_opened AND started_navigation) navigation_sessions,
        count(*) FILTER(WHERE app_opened AND zero_results) zero_results_sessions,
        count(*) FILTER(WHERE app_opened AND NOT (results_shown OR used_search OR applied_filters OR selected_place OR started_navigation)) no_discovery_sessions
      FROM per_session
    )
    SELECT jsonb_build_object(
      'updated_at',now(),'days',v_days,
      'guest_app_sessions',t.app_sessions,
      'discovery_sessions',t.discovery_sessions,
      'discovery_result_sessions',t.results_sessions,
      'intentional_discovery_sessions',t.intentional_sessions,
      'search_sessions',t.search_sessions,
      'filtered_sessions',t.filtered_sessions,
      'place_selected_sessions',t.selected_sessions,
      'navigation_sessions',t.navigation_sessions,
      'zero_result_sessions',t.zero_results_sessions,
      'non_discovery_sessions',t.no_discovery_sessions,
      'discovery_rate_percent',CASE WHEN t.app_sessions>0 THEN round(100.0*t.discovery_sessions/t.app_sessions,1) ELSE 0 END,
      'intentional_rate_percent',CASE WHEN t.app_sessions>0 THEN round(100.0*t.intentional_sessions/t.app_sessions,1) ELSE 0 END,
      'place_selection_rate_percent',CASE WHEN t.app_sessions>0 THEN round(100.0*t.selected_sessions/t.app_sessions,1) ELSE 0 END,
      'guest_entry_visitor_ids',(SELECT count(*) FROM per_visitor WHERE entered_as_guest),
      'guest_entry_discovery_visitor_ids',(SELECT count(*) FROM per_visitor WHERE entered_as_guest AND discovered),
      'returning_discovery_visitor_ids',(SELECT count(*) FROM per_visitor WHERE app_sessions>1 AND discovered)
    ) FROM totals t
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.owner_guest_discovery_funnel(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT private.owner_guest_discovery_funnel(p_days);
$function$;
REVOKE ALL ON FUNCTION private.owner_guest_discovery_funnel(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.owner_guest_discovery_funnel(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.owner_guest_discovery_funnel(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_guest_discovery_funnel(integer) TO authenticated;
