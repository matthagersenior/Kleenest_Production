
CREATE TABLE IF NOT EXISTS internal.geo_owner_consolidation_tombstones (
 source_location_id uuid PRIMARY KEY,
 survivor_location_id uuid NOT NULL,
 archived_record jsonb,
 latest_outbox_id bigint NOT NULL,
 retired boolean NOT NULL DEFAULT true,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.geo_owner_consolidation_tombstones FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS geo_owner_consolidation_retired_idx
 ON internal.geo_owner_consolidation_tombstones(survivor_location_id) WHERE retired;

CREATE OR REPLACE FUNCTION internal.block_geo_location_alias_replay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF EXISTS (SELECT 1 FROM internal.geo_location_duplicate_tombstones t
            WHERE t.duplicate_location_id=NEW.id) THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM internal.geo_owner_consolidation_tombstones t
            WHERE t.source_location_id=NEW.id AND t.retired) THEN RETURN NULL; END IF;
 IF NEW.source_dataset='OpenStreetMap' AND NEW.source_external_id LIKE 'osm:%'
    AND EXISTS(SELECT 1 FROM public.geo_locations g
               WHERE g.source_dataset='osm' AND g.source_external_id=NEW.source_external_id
                 AND g.id IS DISTINCT FROM NEW.id) THEN RETURN NULL; END IF;
 RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION internal.block_geo_location_alias_replay() FROM PUBLIC,anon,authenticated;

-- Receiver is authorized by its existing x-kleenest-geo-archive shared secret.
-- The RPC is service-role-only; owner apps cannot call it directly.
CREATE OR REPLACE FUNCTION public.apply_geo_catalog_retirements(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
 e jsonb; v_action text; v_source uuid; v_survivor uuid; v_outbox bigint;
 v_original jsonb; v_existing internal.geo_owner_consolidation_tombstones%ROWTYPE;
 v_applied integer:=0; v_skipped integer:=0; v_restored integer:=0;
BEGIN
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>100
    OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Expected 1..100 retirement events'; END IF;
 FOR e IN SELECT x FROM jsonb_array_elements(p_items) x ORDER BY (x->>'id')::bigint
 LOOP
  v_outbox:=(e->>'id')::bigint;
  v_action:=e->>'action';
  v_source:=(e->>'source_location_id')::uuid;
  v_survivor:=(e->>'survivor_location_id')::uuid;
  IF v_source IS NULL OR v_survivor IS NULL OR v_source=v_survivor OR
     v_action NOT IN('retire','restore') OR v_outbox IS NULL THEN
   RAISE EXCEPTION 'Invalid geo consolidation event';
  END IF;
  PERFORM pg_advisory_xact_lock(477701,pg_catalog.hashtext(v_source::text));
  SELECT * INTO v_existing FROM internal.geo_owner_consolidation_tombstones
    WHERE source_location_id=v_source FOR UPDATE;
  IF FOUND AND v_existing.latest_outbox_id>=v_outbox THEN
   v_skipped:=v_skipped+1; CONTINUE;
  END IF;
  IF v_action='retire' THEN
   -- The surviving location must already be mirrored to avoid temporary map disappearance.
   IF NOT EXISTS (SELECT 1 FROM public.geo_locations WHERE id=v_survivor) THEN
     RAISE EXCEPTION 'Geo survivor not mirrored yet: %',v_survivor;
   END IF;
   SELECT to_jsonb(g) INTO v_original FROM public.geo_locations g WHERE g.id=v_source FOR UPDATE;
   INSERT INTO internal.geo_owner_consolidation_tombstones(
     source_location_id,survivor_location_id,archived_record,latest_outbox_id,retired)
   VALUES(v_source,v_survivor,v_original,v_outbox,true)
   ON CONFLICT(source_location_id) DO UPDATE SET
     survivor_location_id=excluded.survivor_location_id,
     archived_record=coalesce(internal.geo_owner_consolidation_tombstones.archived_record,excluded.archived_record),
     latest_outbox_id=excluded.latest_outbox_id,retired=true,updated_at=now();
   DELETE FROM public.geo_locations WHERE id=v_source;
   v_applied:=v_applied+1;
  ELSE
   IF NOT FOUND THEN RAISE EXCEPTION 'No geo retirement exists to restore'; END IF;
   IF v_existing.survivor_location_id<>v_survivor THEN RAISE EXCEPTION 'Survivor differs from archived record'; END IF;
   UPDATE internal.geo_owner_consolidation_tombstones SET retired=false,
       latest_outbox_id=v_outbox,updated_at=now()
    WHERE source_location_id=v_source;
   IF v_existing.archived_record IS NOT NULL AND
      NOT EXISTS(SELECT 1 FROM public.geo_locations WHERE id=v_source) THEN
     INSERT INTO public.geo_locations
       SELECT (pg_catalog.jsonb_populate_record(NULL::public.geo_locations,v_existing.archived_record)).*;
   END IF;
   v_restored:=v_restored+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'retired',v_applied,'restored',v_restored,'skipped',v_skipped);
END;
$f$;
REVOKE ALL ON FUNCTION public.apply_geo_catalog_retirements(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_geo_catalog_retirements(jsonb) TO service_role;
