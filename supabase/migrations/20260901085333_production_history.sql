create or replace function public.get_business_intelligence_authority_bundle(p_business_id uuid,p_start timestamptz default null,p_end timestamptz default null)
returns jsonb language plpgsql security definer set search_path='public','auth','extensions','pg_temp'
as $function$
declare v_entitlement jsonb; v_links jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 v_entitlement:=public.get_business_service_entitlement(p_business_id);
 if v_entitlement is null or v_entitlement='{}'::jsonb then raise exception 'Business access denied'; end if;
 if coalesce(v_entitlement->>'service_tier','business') not in ('growth','fleet','enterprise') and not public.is_platform_owner(auth.uid()) then raise exception 'Business intelligence entitlement required'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_links from (select id,location_id,business_id,surface,signal_type,action_type,status,metadata,created_at,updated_at from public.intelligence_action_links where business_id=p_business_id and surface='business' order by created_at desc limit 100)x;
 return jsonb_build_object('schema_version','business-intelligence-v1','business_id',p_business_id,'window',jsonb_build_object('start',p_start,'end',p_end),'entitlement',v_entitlement,'dashboard',public.business_dashboard_secure_summary(p_business_id,p_start,p_end),'location_intelligence',public.business_location_intelligence(p_business_id,p_start,p_end),'growth_actions',public.get_business_growth_action_summary(p_business_id),'attribution',public.get_business_attribution_funnel(p_business_id,p_start,p_end),'roi',public.business_roi_analytics(p_business_id,p_start,p_end),'action_links',v_links);
end $function$;
