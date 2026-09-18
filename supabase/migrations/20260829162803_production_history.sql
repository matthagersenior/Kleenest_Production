revoke execute on function public.get_business_intelligence_authority_bundle(uuid,timestamptz,timestamptz) from anon;
revoke execute on function public.get_business_intelligence_authority_bundle(uuid,timestamptz,timestamptz) from public;
grant execute on function public.get_business_intelligence_authority_bundle(uuid,timestamptz,timestamptz) to authenticated;
