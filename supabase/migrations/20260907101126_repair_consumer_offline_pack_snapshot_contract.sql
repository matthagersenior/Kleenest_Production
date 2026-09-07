CREATE OR REPLACE FUNCTION public.create_offline_pack(
  p_pack_type text,
  p_name text DEFAULT NULL::text,
  p_business_id uuid DEFAULT NULL::uuid,
  p_route_discovery_session_id uuid DEFAULT NULL::uuid,
  p_west double precision DEFAULT NULL::double precision,
  p_south double precision DEFAULT NULL::double precision,
  p_east double precision DEFAULT NULL::double precision,
  p_north double precision DEFAULT NULL::double precision,
  p_expires_hours integer DEFAULT 24
)
RETURNS public.offline_packs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pack public.offline_packs;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_pack_type = 'business' AND (
    p_business_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = p_business_id
        AND bm.user_id = v_user
    )
  ) THEN
    RAISE EXCEPTION 'business pack access denied';
  END IF;

  IF p_pack_type = 'route' AND (
    p_route_discovery_session_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.route_discovery_sessions r
      WHERE r.id = p_route_discovery_session_id
        AND r.user_id = v_user
    )
  ) THEN
    RAISE EXCEPTION 'route pack access denied';
  END IF;

  INSERT INTO public.offline_packs(
    user_id, pack_type, name, business_id, route_discovery_session_id,
    west, south, east, north, status, expires_at
  )
  VALUES (
    v_user, p_pack_type, p_name, p_business_id, p_route_discovery_session_id,
    p_west, p_south, p_east, p_north, 'preparing',
    now() + make_interval(hours => greatest(1, least(coalesce(p_expires_hours, 24), 168)))
  )
  RETURNING * INTO v_pack;

  INSERT INTO public.offline_pack_locations(pack_id, location_id, snapshot)
  SELECT
    v_pack.id,
    l.id,
    jsonb_build_object(
      'id', l.id,
      'location_id', l.id,
      'name', l.name,
      'category', 'restroom',
      'address', l.address,
      'city', l.city,
      'state', l.state,
      'postal_code', l.postal_code,
      'latitude', l.latitude,
      'longitude', l.longitude,
      'source', l.source,
      'source_dataset', l.source_dataset,
      'source_external_id', l.source_external_id,
      'place_type', l.place_type,
      'phone', l.phone,
      'website', l.website,
      'description', l.description,
      'accessible', l.accessible,
      'changing_table', l.changing_table,
      'smart_bathroom', l.smart_bathroom,
      'cleaning_schedule', l.cleaning_schedule,
      'promo_offer', l.promo_offer,
      'rating', l.rating,
      'review_count', l.review_count,
      'cleanliness_pct', l.cleanliness_pct,
      'verification_confidence', l.verification_confidence,
      'bathroom_verification_status', l.bathroom_verification_status,
      'is_verified', (
        coalesce(l.verification_status::text, '') = 'verified'
        OR coalesce(l.bathroom_verification_status, '') IN ('has_bathroom', 'verified')
      ),
      'brand', coalesce(l.source_metadata->>'brand', l.source_metadata->>'brand_name', l.source_metadata->'evidence'->>'brand'),
      'operator_name', coalesce(l.source_metadata->>'operator', l.source_metadata->>'operator_name', l.source_metadata->'evidence'->>'operator'),
      'amenities', coalesce((
        SELECT jsonb_agg(DISTINCT jsonb_build_object('name', a.name, 'category', a.category))
        FROM public.location_amenities la
        JOIN public.amenities a ON a.id = la.amenity_id
        WHERE la.location_id = l.id
      ), '[]'::jsonb)
    )
  FROM public.locations l
  WHERE (
    p_route_discovery_session_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.route_discovery_locations r
      WHERE r.session_id = p_route_discovery_session_id
        AND r.location_id = l.id
    )
  ) OR (
    p_west IS NOT NULL
    AND p_south IS NOT NULL
    AND p_east IS NOT NULL
    AND p_north IS NOT NULL
    AND l.longitude BETWEEN p_west AND p_east
    AND l.latitude BETWEEN p_south AND p_north
  );

  IF p_business_id IS NOT NULL THEN
    INSERT INTO public.offline_pack_businesses(pack_id, business_id, snapshot)
    SELECT v_pack.id, b.id, to_jsonb(b)
    FROM public.businesses b
    WHERE b.id = p_business_id
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.offline_packs
  SET status = 'ready', updated_at = now()
  WHERE id = v_pack.id
  RETURNING * INTO v_pack;

  RETURN v_pack;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) TO authenticated, service_role;
