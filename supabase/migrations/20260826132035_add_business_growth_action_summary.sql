create or replace function public.get_business_growth_action_summary(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_result jsonb; v_locations integer:=0; v_healthy integer:=0; v_active_promotions integer:=0; v_active_campaigns integer:=0; v_qr_scans integer:=0; v_redemptions integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists (select 1 from public.app_business_memberships m where m.business_id=p_business_id and m.user_id=auth.uid()) then raise exception 'Business access denied'; end if;
 select count(*) into v_locations from public.business_members bm where bm.business_id=p_business_id;
 select count(*) filter (where coalesce(business_restroom_health_score(p_business_id,bm.location_id),0)>=75), count(*) into v_healthy,v_locations from public.business_members bm where bm.business_id=p_business_id;
 select count(*) into v_active_promotions from public.promotions p where p.business_id=p_business_id and p.active=true and (p.ends_at is null or p.ends_at>=now());
 select count(*) into v_active_campaigns from public.business_campaigns c where c.business_id=p_business_id and c.status in ('active','running') and (c.ends_at is null or c.ends_at>=now());
 select count(*) into v_qr_scans from public.qr_attribution_events q where q.business_id=p_business_id and q.action_type in ('scan','view','engagement');
 select count(*) into v_redemptions from public.qr_redemptions q join public.qr_codes c on c.id=q.qr_code_id where c.business_id=p_business_id;
 v_result:=jsonb_build_object('business_id',p_business_id,'locations',v_locations,'healthy_locations',v_healthy,'active_promotions',v_active_promotions,'active_campaigns',v_active_campaigns,'qr_engagements',v_qr_scans,'qr_redemptions',v_redemptions,'actions',jsonb_build_array(
   case when v_locations=0 then jsonb_build_object('priority','critical','type','locations','title','Add or claim your first location') else null end,
   case when v_locations>0 and v_healthy=0 then jsonb_build_object('priority','high','type','restroom_health','title','Improve restroom health signals') else null end,
   case when v_locations>0 and v_active_promotions=0 then jsonb_build_object('priority','medium','type','promotion','title','Create a customer promotion') else null end,
   case when v_locations>0 and v_qr_scans=0 then jsonb_build_object('priority','medium','type','qr','title','Deploy a Kleenest QR engagement point') else null end
 )- 'null');
 return v_result;
end; $$;
revoke all on function public.get_business_growth_action_summary(uuid) from anon;
grant execute on function public.get_business_growth_action_summary(uuid) to authenticated;
create index if not exists qr_attribution_business_action_created_idx on public.qr_attribution_events(business_id,action_type,created_at desc);
create index if not exists qr_codes_business_idx on public.qr_codes(business_id);
create index if not exists promotions_business_active_ends_idx on public.promotions(business_id,active,ends_at);
create index if not exists business_campaigns_business_status_ends_idx on public.business_campaigns(business_id,status,ends_at);
