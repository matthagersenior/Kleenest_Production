-- Reduce Supabase IO budget usage without sacrificing exact Owner metrics.
-- Canonical active counts are maintained by statement-level location triggers.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '40s';
CREATE INDEX IF NOT EXISTS locations_canonical_created_at_idx ON public.locations (created_at);
CREATE INDEX IF NOT EXISTS locations_canonical_updated_at_idx ON public.locations (updated_at);

CREATE OR REPLACE FUNCTION internal.refresh_ingestion_canonical_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_active bigint;
 v_inactive bigint;
 v_added_1h bigint;
 v_added_24h bigint;
 v_updated_24h bigint;
 v_snapshot jsonb;
BEGIN
 SELECT metric_value INTO v_active FROM internal.platform_metrics
  WHERE metric_key='canonical_active_locations' AND exact=true;
 IF v_active IS NULL THEN
  RAISE EXCEPTION 'Exact canonical active location counter is unavailable';
 END IF;
 SELECT count(*) INTO v_inactive FROM public.locations WHERE is_active=false;
 SELECT count(*) INTO v_added_1h FROM public.locations
  WHERE created_at >= now()-interval '1 hour';
 SELECT count(*) INTO v_added_24h FROM public.locations
  WHERE created_at >= now()-interval '24 hours';
 SELECT count(*) INTO v_updated_24h FROM public.locations
  WHERE updated_at >= now()-interval '24 hours';
 INSERT INTO public.ingestion_canonical_metrics_cache
  (singleton,total,added_1h,added_24h,updated_24h,generated_at)
 VALUES (true,v_active+v_inactive,v_added_1h,v_added_24h,v_updated_24h,now())
 ON CONFLICT(singleton) DO UPDATE SET
  total=excluded.total,
  added_1h=excluded.added_1h,
  added_24h=excluded.added_24h,
  updated_24h=excluded.updated_24h,
  generated_at=excluded.generated_at;
 SELECT jsonb_build_object(
 'total',total,'added_1h',added_1h,'added_24h',added_24h,
 'updated_24h',updated_24h,'generated_at',generated_at,
 'count_source','cached_exact') INTO v_snapshot
 FROM public.ingestion_canonical_metrics_cache WHERE singleton;
 RETURN v_snapshot;
END $fn$;
REVOKE ALL ON FUNCTION internal.refresh_ingestion_canonical_metrics()
 FROM PUBLIC, anon, authenticated;
