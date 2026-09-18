revoke execute on function public.admin_get_business_access(uuid) from anon;
revoke execute on function public.business_intelligence_authorized(uuid) from anon;
revoke execute on function public.business_restroom_health_score(uuid,uuid) from anon;
revoke execute on function public.enterprise_list_partner_businesses(uuid) from anon;
revoke execute on function public.get_business_growth_action_summary(uuid) from anon;
revoke execute on function public.get_business_service_entitlement(uuid) from anon;
revoke execute on function public.list_qr_engagement_programs(uuid) from anon;

-- These are intentionally authenticated product operations; anonymous callers
-- must enter through the public QR resolution/attribution contracts instead.
grant execute on function public.list_qr_engagement_programs(uuid) to authenticated;
grant execute on function public.get_business_service_entitlement(uuid) to authenticated;
grant execute on function public.business_intelligence_authorized(uuid) to authenticated;
grant execute on function public.business_restroom_health_score(uuid,uuid) to authenticated;
grant execute on function public.get_business_growth_action_summary(uuid) to authenticated;
