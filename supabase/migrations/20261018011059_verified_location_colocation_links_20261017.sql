
-- Verified multi-tenant building relationships. Distinct business identities are retained.
CREATE TABLE IF NOT EXISTS public.location_colocation_links (
 first_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
 second_location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
 review_case_id bigint NOT NULL UNIQUE REFERENCES public.location_duplicate_cases(id) ON DELETE CASCADE,
 relation_kind text NOT NULL DEFAULT 'separate_business_same_building'
   CHECK (relation_kind='separate_business_same_building'),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(first_location_id,second_location_id),
 CONSTRAINT location_colocation_links_ordered CHECK(first_location_id<second_location_id)
);
CREATE INDEX IF NOT EXISTS location_colocation_links_second_idx ON public.location_colocation_links(second_location_id);
ALTER TABLE public.location_colocation_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.location_colocation_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.location_colocation_links TO anon,authenticated;
CREATE POLICY location_colocation_links_public_read
 ON public.location_colocation_links FOR SELECT TO anon,authenticated USING (true);

CREATE OR REPLACE FUNCTION internal.sync_reviewed_colocation_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF NEW.status='co_located' THEN
  INSERT INTO public.location_colocation_links(
   first_location_id,second_location_id,review_case_id,verified_at)
  VALUES(NEW.first_location_id,NEW.second_location_id,NEW.id,now())
  ON CONFLICT(first_location_id,second_location_id)
  DO UPDATE SET review_case_id=excluded.review_case_id,verified_at=excluded.verified_at;
 ELSIF TG_OP='UPDATE' AND OLD.status='co_located' THEN
  DELETE FROM public.location_colocation_links WHERE review_case_id=NEW.id;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.sync_reviewed_colocation_link()
 FROM PUBLIC,anon,authenticated;

CREATE TRIGGER sync_reviewed_colocation_link
 AFTER INSERT OR UPDATE OF status ON public.location_duplicate_cases
 FOR EACH ROW EXECUTE FUNCTION internal.sync_reviewed_colocation_link();

-- Reconcile any prior Owner-reviewed co-locations if this migration is ever reapplied.
INSERT INTO public.location_colocation_links(
 first_location_id,second_location_id,review_case_id)
SELECT first_location_id,second_location_id,id
FROM public.location_duplicate_cases WHERE status='co_located'
ON CONFLICT(first_location_id,second_location_id) DO NOTHING;
