
-- Every owner review decision is durable, attributed and reversible.
CREATE TABLE IF NOT EXISTS public.location_duplicate_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id bigint NOT NULL REFERENCES public.location_duplicate_cases(id) ON DELETE RESTRICT,
  reviewer_id uuid,
  previous_status text NOT NULL,
  next_status text NOT NULL,
  previous_notes text,
  next_notes text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS location_duplicate_review_events_case_time_idx
  ON public.location_duplicate_review_events(case_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS location_duplicate_review_events_time_idx
  ON public.location_duplicate_review_events(changed_at DESC);
ALTER TABLE public.location_duplicate_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.location_duplicate_review_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.location_duplicate_review_events TO authenticated;
CREATE POLICY location_duplicate_review_events_owner_read
 ON public.location_duplicate_review_events FOR SELECT TO authenticated
 USING ((SELECT public.is_platform_owner_session()));

CREATE OR REPLACE FUNCTION internal.audit_location_duplicate_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $audit$
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status
 OR OLD.review_notes IS DISTINCT FROM NEW.review_notes THEN
  INSERT INTO public.location_duplicate_review_events
    (case_id,reviewer_id,previous_status,next_status,previous_notes,next_notes,changed_at)
  VALUES
    (NEW.id,auth.uid(),OLD.status,NEW.status,OLD.review_notes,NEW.review_notes,now());
 END IF;
 RETURN NEW;
END;
$audit$;
REVOKE ALL ON FUNCTION internal.audit_location_duplicate_review()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_location_duplicate_review
 AFTER UPDATE OF status,review_notes ON public.location_duplicate_cases
 FOR EACH ROW EXECUTE FUNCTION internal.audit_location_duplicate_review();
