alter table public.qr_attribution_events add column if not exists campaign_id uuid references public.business_campaigns(id) on delete set null, add column if not exists promotion_id uuid references public.promotions(id) on delete set null, add column if not exists engagement_program_id uuid references public.qr_engagement_programs(id) on delete set null;
create index if not exists idx_qr_attr_business_campaign_created on public.qr_attribution_events(business_id,campaign_id,created_at desc);
create index if not exists idx_qr_attr_business_promotion_created on public.qr_attribution_events(business_id,promotion_id,created_at desc);
create or replace function public.record_qr_attribution(p_code text,p_action_type text default 'scan',p_source text default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to 'public','auth','extensions','pg_catalog'
as $function$
declare v_qr public.qr_codes; v_id uuid; v_business uuid; v_location uuid; v_campaign uuid; v_promotion uuid; v_program uuid; v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_code),'') is null then raise exception 'QR code is required'; end if;
 select * into v_qr from public.qr_codes where code=trim(p_code) and coalesce(active,true) limit 1;
 if not found then raise exception 'QR code not found or inactive'; end if;
 v_location:=v_qr.location_id; select business_id into v_business from public.locations where id=v_location;
 begin v_campaign:=(v_meta->>'campaign_id')::uuid; exception when invalid_text_representation then v_campaign:=null; end;
 begin v_promotion:=(v_meta->>'promotion_id')::uuid; exception when invalid_text_representation then v_promotion:=null; end;
 begin v_program:=(v_meta->>'engagement_program_id')::uuid; exception when invalid_text_representation then v_program:=null; end;
 if v_campaign is not null and not exists(select 1 from public.business_campaigns where id=v_campaign and business_id=v_business and (location_id is null or location_id=v_location)) then v_campaign:=null; end if;
 if v_promotion is not null and not exists(select 1 from public.promotions where id=v_promotion and business_id=v_business and (location_id is null or location_id=v_location)) then v_promotion:=null; end if;
 if v_program is not null and not exists(select 1 from public.qr_engagement_programs qep join public.qr_codes q on q.id=qep.qr_code_id where qep.id=v_program and qep.qr_code_id=v_qr.id) then v_program:=null; end if;
 insert into public.qr_attribution_events(qr_code_id,location_id,business_id,user_id,action_type,source,metadata,campaign_id,promotion_id,engagement_program_id) values(v_qr.id,v_location,v_business,auth.uid(),coalesce(nullif(trim(p_action_type),''),'scan'),p_source,v_meta,v_campaign,v_promotion,v_program) on conflict do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.qr_attribution_events where qr_code_id=v_qr.id and user_id=auth.uid() and action_type=coalesce(nullif(trim(p_action_type),''),'scan') and created_at>now()-interval '1 minute' order by created_at desc limit 1; end if;
 return v_id;
end $function$;
grant execute on function public.record_qr_attribution(text,text,text,jsonb) to authenticated;
revoke execute on function public.record_qr_attribution(text,text,text,jsonb) from anon;
create or replace function public.get_business_attribution_funnel(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language sql security definer stable set search_path to 'public','auth','extensions','pg_catalog'
as $function$
 select jsonb_build_object('business_id',p_business_id,'start',p_start,'end',p_end,'qr_scans',count(*) filter(where action_type='scan'),'qr_engagements',count(*) filter(where action_type not in('scan','redeem')),'qr_redemptions',count(*) filter(where action_type in('redeem','redemption')),'attributed_users',count(distinct user_id),'campaigns',count(distinct campaign_id),'promotions',count(distinct promotion_id),'locations',count(distinct location_id)) from public.qr_attribution_events where business_id=p_business_id and created_at>=p_start and created_at<=p_end;
$function$;
grant execute on function public.get_business_attribution_funnel(uuid,timestamptz,timestamptz) to authenticated;
revoke execute on function public.get_business_attribution_funnel(uuid,timestamptz,timestamptz) from anon;
