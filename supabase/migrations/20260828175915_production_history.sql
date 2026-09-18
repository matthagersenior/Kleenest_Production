REVOKE EXECUTE ON FUNCTION public.submit_location_verification(uuid,boolean,boolean,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_location_verification(uuid,boolean,boolean,text,uuid) TO authenticated;
