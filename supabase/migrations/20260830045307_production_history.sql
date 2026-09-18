create or replace function public.record_qr_attribution(p_code text,p_action_type text default 'scan'::text,p_source text default null,p_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path to 'public','auth','extensions','pg_catalog' as $function$
declare v_qr public.qr_codes;v_id uuid;v_business uuid;v_location uuid;v_campaign uuid;v_promotion uuid;v_program uuid;v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if nullif(trim(p_code),'') is null then raise exception 'QR code is required';end if;
 select * into v_qr from public.qr_codes where code=trim(p_code) and coalesce(active,true) limit 1;
 if not found then raise exception 'QR code not found or inactive';end if;
 v_location:=v_qr.location_id;select business_id into v_business from public.locations where id=v_location;
 begin v_campaign:=(v_meta->>'campaign_id')::uuid;exception when invalid_text_representation then v_campaign:=null;end;
 begin v_promotion:=(v_meta->>'promotion_id')::uuid;exception when invalid_text_representation then v_promotion:=null;end;
 begin v_program:=(v_meta->>'engagement_program_id')::uuid;exception when invalid_text_representation then v_program:=null;end;
 if v_campaign is not null and not exists(
   select 1 from public.business_campaigns bc where bc.id=v_campaign and bc.business_id=v_business and (bc.location_id is null or bc.location_id=v_location)
   union all
   select 1 from public.enterprise_partner_campaigns ec join public.enterprise_partner_networks en on en.id=ec.network_id where ec.id=v_campaign and en.owner_business_id=v_business
 ) then v_campaign:=null;end if;
 if v_promotion is not null and not exists(select 1 from public.promotions where id=v_promotion and business_id=v_business and (location_id is null or location_id=v_location)) then v_promotion:=null;end if;
 if v_program is not null and not exists(select 1 from public.qr_engagement_programs qep where qep.id=v_program and qep.qr_code_id=v_qr.id) then v_program:=null;end if;
 insert into public.qr_attribution_events(qr_code_id,location_id,business_id,user_id,action_type,source,metadata,campaign_id,promotion_id,engagement_program_id) values(v_qr.id,v_location,v_business,auth.uid(),coalesce(nullif(trim(p_action_type),''),'scan'),p_source,v_meta,v_campaign,v_promotion,v_program) on conflict do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.qr_attribution_events where qr_code_id=v_qr.id and user_id=auth.uid() and action_type=coalesce(nullif(trim(p_action_type),''),'scan') and created_at>now()-interval '1 minute' order by created_at desc limit 1;end if;
 return v_id;
end $function$;

create or replace function public.get_business_growth_action_summary(p_business_id uuid) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_catalog' as $function$
declare v_result jsonb;v_locations integer:=0;v_healthy integer:=0;v_active_promotions integer:=0;v_active_campaigns integer:=0;v_qr_scans integer:=0;v_redemptions integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required';end if;
 select count(*),count(*) filter(where coalesce(public.business_restroom_health_score(p_business_id,l.id),0)>=75) into v_locations,v_healthy from public.locations l where l.business_id=p_business_id and coalesce(l.is_active,true);
 select count(*) into v_active_promotions from public.promotions p where p.business_id=p_business_id and p.active=true and (p.ends_at is null or p.ends_at>=now());
 select count(*) into v_active_campaigns from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where n.owner_business_id=p_business_id and c.status='active';
 select count(*) into v_qr_scans from public.qr_attribution_events q where q.business_id=p_business_id and q.action_type in('scan','view','engagement');
 select count(*) into v_redemptions from public.qr_redemptions r join public.qr_codes q on q.id=r.qr_code_id join public.locations l on l.id=q.location_id where l.business_id=p_business_id;
 v_result:=jsonb_build_object('business_id',p_business_id,'locations',v_locations,'healthy_locations',v_healthy,'active_promotions',v_active_promotions,'active_campaigns',v_active_campaigns,'qr_engagements',v_qr_scans,'qr_redemptions',v_redemptions,'actions',jsonb_build_array(
  case when v_locations=0 then jsonb_build_object('priority','critical','type','locations','title','Add or claim your first location') else null end,
  case when v_locations>0 and v_healthy=0 then jsonb_build_object('priority','high','type','restroom_health','title','Improve restroom health signals') else null end,
  case when v_locations>0 and v_active_promotions=0 then jsonb_build_object('priority','medium','type','promotion','title','Create a customer promotion') else null end,
  case when v_locations>0 and v_active_campaigns=0 then jsonb_build_object('priority','medium','type','campaign','title','Create or activate a growth campaign') else null end,
  case when v_locations>0 and v_qr_scans=0 then jsonb_build_object('priority','medium','type','qr','title','Deploy a Kleenest QR engagement point') else null end
 )-'null');
 return v_result;
end $function$;
revoke all on function public.record_qr_attribution(text,text,text,jsonb) from public,anon;
revoke all on function public.get_business_growth_action_summary(uuid) from public,anon;
grant execute on function public.record_qr_attribution(text,text,text,jsonb) to authenticated;
grant execute on function public.get_business_growth_action_summary(uuid) to authenticated;
