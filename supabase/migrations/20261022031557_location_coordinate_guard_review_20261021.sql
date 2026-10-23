-- Generated from the applied Production migration 20261022031557 (location_coordinate_guard_review_20261021).
-- No historic source coordinate is moved without strong same-entity evidence.
CREATE TABLE IF NOT EXISTS internal.location_coordinate_review_cases (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
 source_key text NOT NULL, external_id text NOT NULL,
 issue_kind text NOT NULL DEFAULT 'source_coordinate_disagreement',
 recorded_latitude double precision, recorded_longitude double precision,
 proposed_latitude double precision, proposed_longitude double precision,
 distance_m numeric,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','auto_applied','corrected','kept','different_place')),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz, review_note text,
 UNIQUE(location_id,source_key,external_id,issue_kind)
);
ALTER TABLE internal.location_coordinate_review_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.location_coordinate_review_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE internal.location_coordinate_review_cases_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.track_external_location_coordinate_drift()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE l public.locations%ROWTYPE; source_key text; dist_m numeric;
 confidence numeric; primary_identity boolean; autocorrect boolean:=false;
BEGIN
 IF NEW.location_id IS NULL OR NEW.latitude IS NULL OR NEW.longitude IS NULL OR
    NEW.latitude NOT BETWEEN -90 AND 90 OR NEW.longitude NOT BETWEEN -180 AND 180
 THEN RETURN NEW; END IF;
 SELECT * INTO l FROM public.locations WHERE id=NEW.location_id;
 IF NOT FOUND OR l.geom IS NULL OR l.latitude IS NULL OR l.longitude IS NULL THEN RETURN NEW; END IF;
 IF abs(l.latitude-NEW.latitude)<0.0002 AND abs(l.longitude-NEW.longitude)<0.0002 THEN RETURN NEW; END IF;
 dist_m:=extensions.st_distance(l.geom,extensions.st_setsrid(
   extensions.st_makepoint(NEW.longitude,NEW.latitude),4326)::extensions.geography);
 IF dist_m<40 THEN RETURN NEW; END IF;
 SELECT s.source_key INTO source_key FROM public.external_data_sources s WHERE s.id=NEW.source_id;
 source_key:=coalesce(source_key,'unknown');
 primary_identity:=l.source_dataset=source_key AND l.source_external_id=NEW.external_id;
 confidence:=CASE WHEN (l.source_metadata->>'source_confidence') ~ '^(0([.][0-9]+)?|1([.]0+)?)$'
     THEN (l.source_metadata->>'source_confidence')::numeric ELSE 0 END;
 IF primary_identity AND dist_m<=125 AND confidence>=0.9 AND coalesce(l.address,'') ~ '^[[:space:]]*[0-9]'
  AND l.claimed_business_id IS NULL AND l.business_id IS NULL AND l.verification_status::text='pending'
  AND NOT EXISTS(SELECT 1 FROM public.check_ins c WHERE c.location_id=l.id)
 THEN
  UPDATE public.locations SET latitude=NEW.latitude,longitude=NEW.longitude
    WHERE id=l.id AND latitude IS NOT DISTINCT FROM l.latitude AND longitude IS NOT DISTINCT FROM l.longitude;
  autocorrect:=FOUND;
 END IF;
 INSERT INTO internal.location_coordinate_review_cases
 (location_id,source_key,external_id,recorded_latitude,recorded_longitude,
  proposed_latitude,proposed_longitude,distance_m,status,evidence)
 VALUES(l.id,source_key,NEW.external_id,l.latitude,l.longitude,NEW.latitude,NEW.longitude,
 round(dist_m,1),CASE WHEN autocorrect THEN 'auto_applied' ELSE 'pending' END,
 jsonb_build_object('canonical_source',l.source_dataset,'canonical_external_id',l.source_external_id,
 'same_source_identity',primary_identity,'source_confidence',confidence))
 ON CONFLICT(location_id,source_key,external_id,issue_kind) DO UPDATE
 SET proposed_latitude=EXCLUDED.proposed_latitude,proposed_longitude=EXCLUDED.proposed_longitude,
 distance_m=EXCLUDED.distance_m,evidence=EXCLUDED.evidence,last_seen_at=now(),
 status=CASE WHEN internal.location_coordinate_review_cases.status IN ('corrected','kept','different_place')
 THEN internal.location_coordinate_review_cases.status ELSE EXCLUDED.status END;
 RETURN NEW;
END;
$function$


DROP TRIGGER IF EXISTS trg_track_external_coordinate_drift ON public.external_location_records;
CREATE TRIGGER trg_track_external_coordinate_drift
AFTER INSERT OR UPDATE OF latitude,longitude,location_id ON public.external_location_records
FOR EACH ROW EXECUTE FUNCTION internal.track_external_location_coordinate_drift();

CREATE OR REPLACE FUNCTION public.owner_location_coordinate_review(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_platform_owner_session() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.distance_m DESC NULLS LAST,x.id),'[]'::jsonb) INTO result
 FROM (SELECT c.id,c.location_id,l.name,l.address,l.city,l.state,c.source_key,c.external_id,
 c.issue_kind,c.recorded_latitude,c.recorded_longitude,c.proposed_latitude,c.proposed_longitude,
 c.distance_m,c.status,c.evidence,c.review_note,c.last_seen_at
 FROM internal.location_coordinate_review_cases c JOIN public.locations l ON l.id=c.location_id
 WHERE c.status='pending' ORDER BY c.distance_m DESC NULLS LAST,c.id
 LIMIT least(greatest(coalesce(p_limit,50),1),100)) x;
 RETURN result;
END;
$function$

REVOKE ALL ON FUNCTION public.owner_location_coordinate_review(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_location_coordinate_review(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_resolve_location_coordinate_case(p_case_id bigint, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c internal.location_coordinate_review_cases%ROWTYPE;l public.locations%ROWTYPE;
BEGIN
 IF NOT public.is_platform_owner_session() THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('corrected','kept','different_place') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF length(trim(coalesce(p_note,'')))<8 THEN RAISE EXCEPTION 'A specific review reason is required'; END IF;
 SELECT * INTO c FROM internal.location_coordinate_review_cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND OR c.status<>'pending' THEN RAISE EXCEPTION 'Case is not pending'; END IF;
 IF p_action='corrected' THEN
  IF c.issue_kind<>'source_coordinate_disagreement' OR c.proposed_latitude IS NULL
    OR c.proposed_longitude IS NULL OR coalesce(c.evidence->>'same_source_identity','false')<>'true'
    OR c.distance_m>250 THEN
   RAISE EXCEPTION 'Source coordinates cannot be adopted without matching identity and distance evidence';
  END IF;
  SELECT * INTO l FROM public.locations WHERE id=c.location_id FOR UPDATE;
  IF l.latitude IS DISTINCT FROM c.recorded_latitude OR l.longitude IS DISTINCT FROM c.recorded_longitude THEN
   RAISE EXCEPTION 'Location has changed; refresh before review';
  END IF;
  UPDATE public.locations SET latitude=c.proposed_latitude,longitude=c.proposed_longitude WHERE id=c.location_id;
 END IF;
 UPDATE internal.location_coordinate_review_cases SET status=p_action,review_note=trim(p_note),reviewed_at=now()
 WHERE id=c.id;
 RETURN jsonb_build_object('id',c.id,'status',p_action,'location_id',c.location_id);
END;
$function$

REVOKE ALL ON FUNCTION public.owner_resolve_location_coordinate_case(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_resolve_location_coordinate_case(bigint,text,text) TO authenticated;
