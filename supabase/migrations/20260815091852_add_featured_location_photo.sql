ALTER TABLE public.location_photos
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS location_photos_one_featured_per_location_idx
  ON public.location_photos(location_id)
  WHERE is_featured = true;

CREATE OR REPLACE FUNCTION public.set_featured_location_photo(p_location_id uuid, p_photo_id uuid)
RETURNS public.location_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier public.business_tier;
  v_photo public.location_photos;
BEGIN
  SELECT b.business_tier INTO v_tier
  FROM public.locations l
  JOIN public.businesses b ON b.id = l.business_id
  WHERE l.id = p_location_id;

  IF v_tier IS NULL OR v_tier NOT IN ('growth','enterprise') THEN
    RAISE EXCEPTION 'Featured location photos require Growth or Enterprise';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = (SELECT business_id FROM public.locations WHERE id = p_location_id)
      AND bm.user_id = auth.uid()
      AND bm.role IN ('owner','admin','manager')
  ) AND COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()),false) = false THEN
    RAISE EXCEPTION 'Not authorized to manage this location';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.location_photos WHERE id = p_photo_id AND location_id = p_location_id) THEN
    RAISE EXCEPTION 'Photo does not belong to location';
  END IF;

  UPDATE public.location_photos SET is_featured = false WHERE location_id = p_location_id;
  UPDATE public.location_photos SET is_featured = true WHERE id = p_photo_id AND location_id = p_location_id
  RETURNING * INTO v_photo;
  RETURN v_photo;
END;
$$;

REVOKE ALL ON FUNCTION public.set_featured_location_photo(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_featured_location_photo(uuid,uuid) TO authenticated;
