alter function public.business_campaign_analytics(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_engagement_analytics(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_location_analytics(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_location_detail(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_location_intelligence(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_location_metrics(uuid,uuid,text,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_qr_detail(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';
alter function public.business_review_detail(uuid,timestamp with time zone,timestamp with time zone) set search_path = '';

revoke execute on function public.business_campaign_analytics(uuid,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_engagement_analytics(uuid,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_location_analytics(uuid,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_location_detail(uuid,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_location_intelligence(uuid,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_location_metrics(uuid,uuid,text,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_qr_detail(uuid,timestamp with time zone,timestamp with time zone) from public, anon;
revoke execute on function public.business_review_detail(uuid,timestamp with time zone,timestamp with time zone) from public, anon;

grant execute on function public.business_campaign_analytics(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_engagement_analytics(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_location_analytics(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_location_detail(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_location_intelligence(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_location_metrics(uuid,uuid,text,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_qr_detail(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
grant execute on function public.business_review_detail(uuid,timestamp with time zone,timestamp with time zone) to authenticated, service_role;
