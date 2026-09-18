CREATE OR REPLACE FUNCTION public.business_create_promotion(p_business_id uuid, p_title text, p_description text DEFAULT NULL::text, p_discount numeric DEFAULT NULL::numeric, p_location_id uuid DEFAULT NULL::uuid, p_starts_at timestamp with time zone DEFAULT now(), p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public','auth','extensions','pg_temp'
AS $$
  SELECT public.business_create_promotion_canonical(
    p_business_id,
    p_title,
    p_description,
    p_discount,
    p_location_id,
    p_starts_at,
    p_ends_at
  );
$$;
