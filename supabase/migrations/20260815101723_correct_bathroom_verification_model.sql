ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS bathroom_verified_at timestamptz, ADD COLUMN IF NOT EXISTS bathroom_verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS bathroom_verified_by uuid, ADD COLUMN IF NOT EXISTS bathroom_verification_source text;
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_bathroom_verification_status_check;
ALTER TABLE public.locations ADD CONSTRAINT locations_bathroom_verification_status_check CHECK (bathroom_verification_status IN ('unverified','has_bathroom','no_bathroom'));
CREATE TABLE IF NOT EXISTS public.location_bathroom_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, has_public_bathroom boolean NOT NULL, latitude double precision NOT NULL, longitude double precision NOT NULL, distance_meters double precision, source text NOT NULL DEFAULT 'community', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(location_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_location_bathroom_verifications_location ON public.location_bathroom_verifications(location_id);
CREATE INDEX IF NOT EXISTS idx_location_bathroom_verifications_user ON public.location_bathroom_verifications(user_id);
CREATE OR REPLACE FUNCTION public.record_bathroom_verification(p_location_id uuid,p_has_public_bathroom boolean,p_lat double precision,p_lng double precision) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); loc record; d double precision; direct boolean:=false; yes_count integer; no_count integer; new_status text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO loc FROM public.locations WHERE id=p_location_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Location not found'; END IF;
 IF loc.bathroom_verification_status <> 'unverified' THEN RETURN jsonb_build_object('status',loc.bathroom_verification_status,'already_verified',true); END IF;
 d:=3958.8*2*atan2(sqrt(sin(radians(p_lat-COALESCE(loc.latitude,0))/2)^2+cos(radians(COALESCE(loc.latitude,0)))*cos(radians(p_lat))*sin(radians(p_lng-COALESCE(loc.longitude,0))/2)^2),sqrt(1-(sin(radians(p_lat-COALESCE(loc.latitude,0))/2)^2+cos(radians(COALESCE(loc.latitude,0)))*cos(radians(p_lat))*sin(radians(p_lng-COALESCE(loc.longitude,0))/2)^2)))*1609.344;
 IF d > 100 THEN RAISE EXCEPTION 'You must be within 100 meters of this location'; END IF;
 direct:=lower(COALESCE((SELECT account_level::text FROM public.profiles WHERE id=u),'standard')) IN ('premium','pro','growth','enterprise') OR EXISTS (SELECT 1 FROM public.business_memberships bm WHERE bm.user_id=u AND bm.business_id=loc.business_id AND lower(bm.role::text) IN ('owner','admin','manager'));
 INSERT INTO public.location_bathroom_verifications(location_id,user_id,has_public_bathroom,latitude,longitude,distance_meters,source) VALUES(p_location_id,u,p_has_public_bathroom,p_lat,p_lng,d,'direct' ) ON CONFLICT(location_id,user_id) DO NOTHING;
 SELECT count(*) FILTER(WHERE has_public_bathroom),count(*) FILTER(WHERE NOT has_public_bathroom) INTO yes_count,no_count FROM public.location_bathroom_verifications WHERE location_id=p_location_id;
 IF direct OR yes_count>=3 OR no_count>=3 THEN new_status:=CASE WHEN p_has_public_bathroom THEN 'has_bathroom' WHEN no_count>=3 THEN 'no_bathroom' ELSE CASE WHEN yes_count>=3 THEN 'has_bathroom' ELSE 'no_bathroom' END END;
   IF direct THEN new_status:=CASE WHEN p_has_public_bathroom THEN 'has_bathroom' ELSE 'no_bathroom' END; END IF;
   UPDATE public.locations SET bathroom_verification_status=new_status,bathroom_verified_at=now(),bathroom_verified_by=u,bathroom_verification_source=CASE WHEN direct THEN 'premium_or_owner' ELSE 'community_3' END WHERE id=p_location_id;
 END IF;
 RETURN jsonb_build_object('status',COALESCE(new_status,'unverified'),'yes_count',yes_count,'no_count',no_count,'direct',direct,'distance_meters',d);
END; $$;
CREATE OR REPLACE FUNCTION public.get_location_bathroom_verification(p_location_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('status',COALESCE(l.bathroom_verification_status,'unverified'),'positive',(SELECT count(*) FROM public.location_bathroom_verifications v WHERE v.location_id=l.id AND v.has_public_bathroom),'negative',(SELECT count(*) FROM public.location_bathroom_verifications v WHERE v.location_id=l.id AND NOT v.has_public_bathroom),'total',(SELECT count(*) FROM public.location_bathroom_verifications v WHERE v.location_id=l.id),'owner_verified',COALESCE(l.bathroom_verification_source='premium_or_owner',false)) FROM public.locations l WHERE l.id=p_location_id; $$;
UPDATE public.locations SET bathroom_verification_status='unverified',bathroom_verified_at=NULL,bathroom_verified_by=NULL,bathroom_verification_source=NULL WHERE bathroom_verification_status='has_bathroom' AND bathroom_verified_at IS NULL;
