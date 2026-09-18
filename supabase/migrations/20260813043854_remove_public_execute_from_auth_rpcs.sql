revoke execute on function public.activate_preferred_location(uuid) from public;
revoke execute on function public.check_preferred_eligibility(uuid) from public;
revoke execute on function public.create_business_for_current_user(text,text,text,text,text) from public;
revoke execute on function public.activate_preferred_location(uuid,uuid) from public;
revoke execute on function public.partner_preferred_analytics(uuid,timestamptz,timestamptz) from public;
revoke execute on function public.record_preferred_location_use(uuid) from public;
