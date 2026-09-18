-- Add unambiguous canonical entry points without removing or changing existing overloads.
CREATE OR REPLACE FUNCTION public.business_create_location_canonical(p_business_id uuid, p_name text, p_address text, p_city text, p_state text, p_postal_code text, p_latitude numeric, p_longitude numeric, p_phone text DEFAULT NULL, p_website text DEFAULT NULL)
RETURNS public.locations LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions','pg_temp' AS $$
DECLARE v public.locations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_members bm WHERE bm.business_id=p_business_id AND bm.user_id=auth.uid() AND coalesce(bm.role,'') IN ('owner','admin','manager'))
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.is_admin=true) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;
  IF p_name IS NULL OR trim(p_name)='' THEN RAISE EXCEPTION 'Location name is required'; END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Valid coordinates are required';
  END IF;
  INSERT INTO public.locations(business_id,name,address,city,state,postal_code,latitude,longitude,phone,website,is_active)
  VALUES(p_business_id,trim(p_name),nullif(trim(p_address),''),nullif(trim(p_city),''),nullif(trim(p_state),''),nullif(trim(p_postal_code),''),p_latitude,p_longitude,nullif(trim(p_phone),''),nullif(trim(p_website),''),true)
  RETURNING * INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.business_create_promotion_canonical(p_business_id uuid, p_title text, p_description text DEFAULT NULL, p_discount numeric DEFAULT NULL, p_location_id uuid DEFAULT NULL, p_starts_at timestamptz DEFAULT now(), p_ends_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions','pg_temp' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.business_can_manage(p_business_id) THEN RAISE EXCEPTION 'Not authorized for this business'; END IF;
  IF NOT public.business_advanced_allowed(p_business_id) THEN RAISE EXCEPTION 'Business Growth or Enterprise plan required'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations WHERE id=p_location_id AND business_id=p_business_id) THEN RAISE EXCEPTION 'Location does not belong to business'; END IF;
  IF p_title IS NULL OR trim(p_title)='' THEN RAISE EXCEPTION 'Promotion title is required'; END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at<=p_starts_at THEN RAISE EXCEPTION 'Promotion end must be after start'; END IF;
  INSERT INTO public.promotions(business_id,title,description,discount,location_id,starts_at,ends_at,active,created_at)
  VALUES(p_business_id,trim(p_title),nullif(trim(p_description),''),p_discount,p_location_id,p_starts_at,p_ends_at,true,now()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.business_set_location_active_canonical(p_location_id uuid, p_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions','pg_temp' AS $$
DECLARE v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.locations WHERE id=p_location_id;
  IF v_business IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF NOT public.business_can_manage(v_business) THEN RAISE EXCEPTION 'Business management access required'; END IF;
  UPDATE public.locations SET is_active=p_active, updated_at=now() WHERE id=p_location_id AND business_id=v_business;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.business_set_promotion_active_canonical(p_promotion_id uuid, p_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions','pg_temp' AS $$
DECLARE v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM public.promotions WHERE id=p_promotion_id;
  IF v_business IS NULL THEN RAISE EXCEPTION 'Promotion not found'; END IF;
  IF NOT public.business_can_manage(v_business) THEN RAISE EXCEPTION 'Business management access required'; END IF;
  IF NOT public.business_advanced_allowed(v_business) THEN RAISE EXCEPTION 'Business Growth or Enterprise plan required'; END IF;
  UPDATE public.promotions SET active=p_active WHERE id=p_promotion_id AND business_id=v_business;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.business_update_location_canonical(p_location_id uuid, p_name text DEFAULT NULL, p_address text DEFAULT NULL, p_phone text DEFAULT NULL, p_website text DEFAULT NULL, p_active boolean DEFAULT NULL)
RETURNS public.locations LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth','extensions','pg_temp' AS $$
DECLARE v public.locations; v_business uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT business_id INTO v_business FROM public.locations WHERE id=p_location_id;
  IF v_business IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_members bm WHERE bm.business_id=v_business AND bm.user_id=auth.uid() AND coalesce(bm.role,'') IN ('owner','admin','manager'))
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.is_admin=true) THEN RAISE EXCEPTION 'Not authorized for this business'; END IF;
  UPDATE public.locations SET name=coalesce(nullif(trim(p_name),''),name), address=coalesce(nullif(trim(p_address),''),address), phone=coalesce(nullif(trim(p_phone),''),phone), website=coalesce(nullif(trim(p_website),''),website), is_active=coalesce(p_active,is_active), updated_at=now() WHERE id=p_location_id RETURNING * INTO v;
  RETURN v;
END $$;
