ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS metrics_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.progression_games ADD COLUMN IF NOT EXISTS metrics_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.progression_challenges ADD COLUMN IF NOT EXISTS metrics_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.business_events ADD COLUMN IF NOT EXISTS metrics_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.progression_metric_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (length(trim(metric)) > 0),
  source_type text NOT NULL CHECK (source_type IN ('social_post','social_comment','social_like','social_save','social_follow','contest','game','challenge','event','check_in','review','verification','route','campaign','promotion','qr_scan')),
  source_id uuid,
  quantity numeric NOT NULL DEFAULT 1,
  points_awarded integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS progression_metric_events_user_created_idx ON public.progression_metric_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS progression_metric_events_source_idx ON public.progression_metric_events(source_type, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS progression_metric_events_metric_idx ON public.progression_metric_events(metric, created_at DESC);

ALTER TABLE public.progression_metric_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS progression_metric_events_own_select ON public.progression_metric_events;
CREATE POLICY progression_metric_events_own_select ON public.progression_metric_events FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS progression_metric_events_own_insert ON public.progression_metric_events;
CREATE POLICY progression_metric_events_own_insert ON public.progression_metric_events FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.record_progression_metric_event(
  p_metric text,
  p_source_type text,
  p_source_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT 1,
  p_points_awarded integer DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.progression_metric_events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_row public.progression_metric_events;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.progression_metric_events(user_id, metric, source_type, source_id, quantity, points_awarded, metadata)
  VALUES (auth.uid(), trim(p_metric), p_source_type, p_source_id, greatest(p_quantity,0), greatest(p_points_awarded,0), coalesce(p_metadata,'{}'::jsonb))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_progression_metric_event(text,text,uuid,numeric,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_progression_metric_event(text,text,uuid,numeric,integer,jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.user_progression_metric_summary AS
SELECT user_id,
       metric,
       sum(quantity) AS quantity,
       sum(points_awarded) AS points_awarded,
       count(*) AS event_count,
       max(created_at) AS last_occurred_at
FROM public.progression_metric_events
GROUP BY user_id, metric;

GRANT SELECT ON public.user_progression_metric_summary TO authenticated;
