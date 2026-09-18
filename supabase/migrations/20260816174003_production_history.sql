INSERT INTO public.progression_actions(code,label,points,enabled)
VALUES
 ('social_comment','Helpful community comment',3,true),
 ('social_save','Save community content',2,true),
 ('game_play','Play a progression game',10,true),
 ('challenge_progress','Advance a challenge',5,true)
ON CONFLICT (code) DO UPDATE SET label=excluded.label, points=excluded.points, enabled=excluded.enabled;

CREATE OR REPLACE FUNCTION public.record_progression_metric_event(
  p_metric text,
  p_source_type text,
  p_source_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT 1,
  p_points_awarded integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.progression_metric_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.progression_metric_events;
DECLARE v_action_points integer;
DECLARE v_enabled boolean;
DECLARE v_points integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT points, enabled INTO v_action_points, v_enabled FROM public.progression_actions WHERE code = trim(p_metric) LIMIT 1;
  IF coalesce(v_enabled,false) THEN
    v_points := greatest(coalesce(v_action_points,0) * greatest(p_quantity,0)::integer,0);
    IF p_source_id IS NOT NULL THEN
      PERFORM public.record_gamification_activity(trim(p_metric), p_source_id);
    END IF;
  ELSE
    v_points := greatest(coalesce(p_points_awarded,0),0);
  END IF;
  INSERT INTO public.progression_metric_events(user_id, metric, source_type, source_id, quantity, points_awarded, metadata)
  VALUES (auth.uid(), trim(p_metric), p_source_type, p_source_id, greatest(p_quantity,0), v_points, coalesce(p_metadata,'{}'::jsonb))
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.record_progression_metric_event(text,text,uuid,numeric,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_progression_metric_event(text,text,uuid,numeric,integer,jsonb) TO authenticated;

UPDATE public.contests SET metrics_config = jsonb_build_object('participation',jsonb_build_object('metric','contest_entry','points',10),'win',jsonb_build_object('metric','contest_win','points',100),'social_amplification',jsonb_build_object('metric','social_post','points',10)) WHERE metrics_config = '{}'::jsonb;
UPDATE public.progression_games SET metrics_config = jsonb_build_object('play',jsonb_build_object('metric','game_play','points',10),'completion',jsonb_build_object('metric','challenge_progress','points',5)) WHERE metrics_config = '{}'::jsonb;
UPDATE public.progression_challenges SET metrics_config = jsonb_build_object('progress',jsonb_build_object('metric','challenge_progress','points',5),'completion',jsonb_build_object('metric','challenge_progress','points',5)) WHERE metrics_config = '{}'::jsonb;
UPDATE public.business_events SET metrics_config = jsonb_build_object('rsvp',jsonb_build_object('metric','event_rsvp','points',5),'attendance',jsonb_build_object('metric','event_attend','points',20),'social_amplification',jsonb_build_object('metric','social_post','points',10)) WHERE metrics_config = '{}'::jsonb;
