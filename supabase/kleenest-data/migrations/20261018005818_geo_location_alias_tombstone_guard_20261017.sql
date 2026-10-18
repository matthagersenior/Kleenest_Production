
-- Geo mirror: archive + remove exactly confirmed legacy OSM aliases.
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS internal.geo_location_duplicate_tombstones (
 duplicate_location_id uuid PRIMARY KEY,
 canonical_location_id uuid NOT NULL,
 source_external_id text NOT NULL,
 original_record jsonb NOT NULL,
 reason text NOT NULL DEFAULT 'same_osm_object_same_coordinates',
 archived_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.geo_location_duplicate_tombstones FROM PUBLIC,anon,authenticated;

WITH exact_pairs AS MATERIALIZED (
 SELECT old.id duplicate_location_id,new.id canonical_location_id,
        old.source_external_id,to_jsonb(old) original_record
 FROM public.geo_locations old
 JOIN public.geo_locations new
 ON new.source_dataset='osm' AND new.source_external_id=old.source_external_id
 WHERE old.source_dataset='OpenStreetMap'
 AND old.source_external_id LIKE 'osm:%'
 AND old.name IS NOT DISTINCT FROM new.name
 AND old.latitude IS NOT DISTINCT FROM new.latitude
 AND old.longitude IS NOT DISTINCT FROM new.longitude
)
INSERT INTO internal.geo_location_duplicate_tombstones
(duplicate_location_id,canonical_location_id,source_external_id,original_record)
SELECT duplicate_location_id,canonical_location_id,source_external_id,original_record
FROM exact_pairs ON CONFLICT(duplicate_location_id) DO NOTHING;

DELETE FROM public.geo_locations g
USING internal.geo_location_duplicate_tombstones a
WHERE g.id=a.duplicate_location_id
  AND g.source_dataset='OpenStreetMap'
  AND g.source_external_id=a.source_external_id;

-- The geo exporter may have in-flight batches. Prevent stale insert/update replay.
CREATE OR REPLACE FUNCTION internal.block_geo_location_alias_replay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
 IF EXISTS (SELECT 1 FROM internal.geo_location_duplicate_tombstones t
            WHERE t.duplicate_location_id=NEW.id) THEN
   RETURN NULL;
 END IF;
 IF NEW.source_dataset='OpenStreetMap' AND NEW.source_external_id LIKE 'osm:%'
    AND EXISTS(SELECT 1 FROM public.geo_locations g
               WHERE g.source_dataset='osm' AND g.source_external_id=NEW.source_external_id
                 AND g.id IS DISTINCT FROM NEW.id)
 THEN RETURN NULL;
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.block_geo_location_alias_replay() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER geo_location_alias_replay_guard
 BEFORE INSERT OR UPDATE OF source_dataset,source_external_id,id
 ON public.geo_locations
 FOR EACH ROW EXECUTE FUNCTION internal.block_geo_location_alias_replay();
