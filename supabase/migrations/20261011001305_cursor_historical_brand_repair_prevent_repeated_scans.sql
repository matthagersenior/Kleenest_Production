-- Avoid restarting large historical brand-repair anti-joins at the beginning every hour.
-- Keep the normal 100-row repair contract and persist an incremental cursor.
CREATE TABLE IF NOT EXISTS internal.brand_identity_backfill_cursor (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 last_id uuid,
 idle_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE internal.brand_identity_backfill_cursor
 FROM PUBLIC, anon, authenticated;
INSERT INTO internal.brand_identity_backfill_cursor(singleton)
VALUES(true) ON CONFLICT(singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.backfill_location_brand_identities(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' SET statement_timeout TO '60s'
AS $fn$
DECLARE
 v_limit integer := greatest(10,least(coalesce(p_limit,100),250));
 v_cursor uuid;
 v_idle_until timestamptz;
 v_scanned integer := 0;
 v_identified integer := 0;
 v_last uuid;
 v_complete boolean := false;
BEGIN
 SELECT last_id,idle_until INTO v_cursor,v_idle_until
 FROM internal.brand_identity_backfill_cursor
 WHERE singleton=true FOR UPDATE;
 IF v_idle_until > now() THEN
  RETURN jsonb_build_object(
   'scanned',0,'identified',0,'locations_updated',0,
   'cycle_complete',true,'repair_mode','explicit_brand_evidence_only',
   'idle_until',v_idle_until,'processed_at',now());
 END IF;
 WITH candidates AS MATERIALIZED (
  SELECT l.id,
   public.resolve_location_brand_identity(
    coalesce(nullif(trim(l.source_metadata->>'brand'),''),
             nullif(trim(l.source_metadata->'tags'->>'brand'),''),
             nullif(trim(l.brand_name),'')),
    l.name,
    coalesce(nullif(trim(l.source_metadata->>'operator'),''),
             nullif(trim(l.source_metadata->'tags'->>'operator'),''),
             nullif(trim(l.operator_name),''))
   ) AS identity
  FROM public.locations l
  WHERE l.id > coalesce(v_cursor,'00000000-0000-0000-0000-000000000000'::uuid)
   AND l.is_active=true
   AND (nullif(trim(l.brand_name),'') IS NOT NULL
     OR nullif(trim(l.source_metadata->>'brand'),'') IS NOT NULL
     OR nullif(trim(l.source_metadata->'tags'->>'brand'),'') IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.location_brand_identities i
                   WHERE i.location_id=l.id)
  ORDER BY l.id LIMIT v_limit
 ), inserted AS (
  INSERT INTO public.location_brand_identities (
   location_id,canonical_brand,source,confidence,alias_key,detected_at,updated_at)
  SELECT c.id,c.identity->>'canonical_brand',
   coalesce(nullif(c.identity->>'source',''),'historical_repair'),
   coalesce(nullif(c.identity->>'confidence','')::numeric,.900),
   nullif(c.identity->>'alias_key',''),now(),now()
  FROM candidates c
  WHERE nullif(c.identity->>'canonical_brand','') IS NOT NULL
  ON CONFLICT(location_id) DO NOTHING RETURNING 1
 )
 SELECT (SELECT count(*) FROM candidates),
        (SELECT count(*) FROM inserted),
        (SELECT id FROM candidates ORDER BY id DESC LIMIT 1)
 INTO v_scanned,v_identified,v_last;
 v_complete := v_scanned < v_limit;
 UPDATE internal.brand_identity_backfill_cursor
 SET last_id=CASE WHEN v_complete THEN NULL ELSE v_last END,
     idle_until=CASE WHEN v_complete THEN now()+interval '6 hours' ELSE NULL END,
     updated_at=now()
 WHERE singleton=true;
 RETURN jsonb_build_object(
  'scanned',v_scanned,'identified',v_identified,'locations_updated',0,
  'cycle_complete',v_complete,
  'cursor',CASE WHEN v_complete THEN null ELSE v_last END,
  'repair_mode','explicit_brand_evidence_only','processed_at',now());
END $fn$;
