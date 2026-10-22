-- Consolidate rapid app relaunches into meaningful 30-minute inactivity-bounded guest visits.
-- No new guest identifiers or raw personal data; source events retain existing 30-day limit.
-- Existing RPCs keep their signatures and response shape; additive fields preserve old clients.
CREATE OR REPLACE FUNCTION private.owner_guest_visitor_groups(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => CASE WHEN p_days=30 THEN 30 ELSE 7 END);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
    RAISE EXCEPTION 'platform owner access required';
  END IF;
  RETURN COALESCE((
    WITH event_window AS (
      SELECT id, visitor_key, session_id, event_name, occurred_at, context
      FROM private.guest_journey_events
      WHERE occurred_at >= v_since
    ),
    ordered_events AS (
      SELECT e.*, lag(e.occurred_at) OVER (PARTITION BY e.visitor_key ORDER BY e.occurred_at,e.id) prev_at
      FROM event_window e
    ),
    visit_clusters AS (
      SELECT e.*, SUM(CASE WHEN e.prev_at IS NULL OR e.occurred_at-e.prev_at > interval '30 minutes'
        THEN 1 ELSE 0 END) OVER (
          PARTITION BY e.visitor_key ORDER BY e.occurred_at,e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) visit_no
      FROM ordered_events e
    ),
    visits_per_id AS (
      SELECT visitor_key,count(DISTINCT visit_no) visit_count
      FROM visit_clusters GROUP BY visitor_key
    ),
    visitors AS (
      SELECT visitor_key, min(occurred_at) first_seen_at, max(occurred_at) last_seen_at,
        count(*) event_count, count(DISTINCT session_id) session_count,
        count(DISTINCT occurred_at::date) active_days,
        count(*) FILTER(WHERE event_name='place_selected') place_selections,
        count(*) FILTER(WHERE event_name='navigation_started') navigation_starts,
        count(*) FILTER(WHERE event_name IN ('review_started','review_submit_attempt','review_submit_success')) review_actions,
        count(*) FILTER(WHERE event_name IN ('install_intent','install_success','installed_app_launch')) install_actions,
        count(*) FILTER(WHERE event_name IN ('search_failed','no_results') OR
          (event_name='nearby_results_shown' AND context->>'result_count'='0')) friction_events,
        (array_agg(event_name ORDER BY occurred_at DESC))[1] last_action
      FROM event_window GROUP BY visitor_key
    ),
    sessions AS (
      SELECT visitor_key, session_id,
        min(occurred_at) started_at, max(occurred_at) last_seen_at,
        count(*) event_count,
        (array_agg(event_name ORDER BY occurred_at DESC))[1] last_action
      FROM event_window GROUP BY visitor_key, session_id
    )
    SELECT jsonb_agg(jsonb_build_object(
      'visitor_label',left(md5(v.visitor_key),10),
      'first_seen_at',v.first_seen_at,'last_seen_at',v.last_seen_at,
      'session_count',v.session_count,'event_count',v.event_count,
      'visit_count',vi.visit_count,'relaunch_sessions',greatest(v.session_count-vi.visit_count,0),
      'active_days',v.active_days,'place_selections',v.place_selections,
      'navigation_starts',v.navigation_starts,'review_actions',v.review_actions,
      'install_actions',v.install_actions,'friction_events',v.friction_events,
      'last_action',v.last_action,
      'registration_linked',exists(
         SELECT 1 FROM private.guest_journey_conversions c
         WHERE c.visitor_key=v.visitor_key AND c.converted_at>=v_since
      ),
      'visit_windows',COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'started_at',w.started_at,'last_seen_at',w.last_seen_at,
          'session_count',w.session_count,'event_count',w.event_count,
          'place_selections',w.place_selections
        ) ORDER BY w.last_seen_at DESC)
        FROM (
          SELECT min(occurred_at) started_at,max(occurred_at) last_seen_at,
            count(DISTINCT session_id) session_count,count(*) event_count,
            count(*) FILTER(WHERE event_name='place_selected') place_selections
          FROM visit_clusters
          WHERE visitor_key=v.visitor_key
          GROUP BY visit_no
          ORDER BY max(occurred_at) DESC LIMIT 20
        ) w
      ),'[]'::jsonb),
      'sessions',COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'session_id',s.session_id,
          'visitor_label',left(md5(v.visitor_key),10),
          'started_at',s.started_at,'last_seen_at',s.last_seen_at,
          'last_action',s.last_action,'event_count',s.event_count
        ) ORDER BY s.last_seen_at DESC)
        FROM (SELECT session_id,started_at,last_seen_at,last_action,event_count
              FROM sessions
              WHERE visitor_key=v.visitor_key
              ORDER BY last_seen_at DESC LIMIT 20) s
      ),'[]'::jsonb)
    ) ORDER BY v.last_seen_at DESC)
    FROM (SELECT * FROM visitors ORDER BY last_seen_at DESC LIMIT 200) v
    JOIN visits_per_id vi ON vi.visitor_key=v.visitor_key
  ),'[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION private.owner_guest_visit_summary(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => CASE WHEN p_days=30 THEN 30 ELSE 7 END);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
    RAISE EXCEPTION 'platform owner access required';
  END IF;
  RETURN (
    WITH event_window AS (
      SELECT e.id,e.visitor_key,e.session_id,e.event_name,e.occurred_at,
        lag(e.occurred_at) OVER (PARTITION BY e.visitor_key ORDER BY e.occurred_at,e.id) prev_at
      FROM private.guest_journey_events e
      WHERE e.occurred_at >= v_since
    ),
    visit_clusters AS (
      SELECT e.*, SUM(CASE WHEN e.prev_at IS NULL OR e.occurred_at-e.prev_at > interval '30 minutes'
          THEN 1 ELSE 0 END) OVER (
        PARTITION BY e.visitor_key ORDER BY e.occurred_at,e.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) visit_no
      FROM event_window e
    ),
    per_visitor AS (
      SELECT visitor_key,
        count(DISTINCT session_id) session_count,
        count(DISTINCT visit_no) visit_count,
        count(DISTINCT occurred_at::date) active_days,
        count(*) FILTER (WHERE event_name='place_selected') place_selections
      FROM visit_clusters GROUP BY visitor_key
    )
    SELECT jsonb_build_object(
      'updated_at', now(),
      'days', CASE WHEN p_days=30 THEN 30 ELSE 7 END,
      'guest_identifiers',count(*),
      'recorded_sessions',COALESCE(sum(session_count),0),
      'estimated_visits',COALESCE(sum(visit_count),0),
      'returning_identifiers',count(*) FILTER (WHERE visit_count > 1),
      'multi_day_identifiers',count(*) FILTER (WHERE active_days > 1),
      'relaunch_sessions',COALESCE(sum(greatest(session_count-visit_count,0)),0),
      'relaunch_heavy_identifiers',count(*) FILTER (WHERE session_count >= 3 AND visit_count = 1),
      'engaged_identifiers',count(*) FILTER (WHERE place_selections > 0)
    )
    FROM per_visitor
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.owner_guest_visit_summary(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO ''
AS $function$
  SELECT private.owner_guest_visit_summary(p_days);
$function$;

REVOKE ALL ON FUNCTION private.owner_guest_visit_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owner_guest_visit_summary(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_guest_visit_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_guest_visit_summary(integer) TO authenticated;
