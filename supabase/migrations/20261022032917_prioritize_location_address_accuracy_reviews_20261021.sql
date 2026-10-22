-- Prioritize real-world address/status contradictions above small coordinate offsets,
-- so owner-visible review window includes records like the stale 1703 N Market St listing.
DO $fix$
DECLARE def text;
 old_inner text:='ORDER BY c.distance_m DESC NULLS LAST,c.id';
 old_outer text:='ORDER BY x.distance_m DESC NULLS LAST,x.id';
BEGIN
 SELECT pg_get_functiondef('public.owner_location_coordinate_review(integer)'::regprocedure) INTO def;
 IF position(old_inner in def)=0 OR position(old_outer in def)=0 THEN
  -- Already patched by the live release or a prior migration.
  IF position('address_status_disagreement' in coalesce(def,''))>0 THEN RETURN; END IF;
  RAISE EXCEPTION 'Unexpected coordinate review SQL; refusing partial rewrite';
 END IF;
 def:=replace(def,old_inner,'ORDER BY (c.issue_kind=''address_status_disagreement'') DESC,c.distance_m DESC NULLS LAST,c.id');
 def:=replace(def,old_outer,'ORDER BY (x.issue_kind=''address_status_disagreement'') DESC,x.distance_m DESC NULLS LAST,x.id');
 EXECUTE def;
END;
$fix$;