create or replace function public.record_qr_attribution(p_code text,p_action_type text default 'scan',p_source text default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_qr public.qr_codes; v_id uuid; v_business uuid; v_location uuid;
begin
 if nullif(trim(p_code),'') is null then raise exception 'QR code is required'; end if;
 select * into v_qr from public.qr_codes where code=trim(p_code) and coalesce(active,true) limit 1;
 if not found then raise exception 'QR code not found or inactive'; end if;
 v_location:=v_qr.location_id;
 select business_id into v_business from public.locations where id=v_location;
 insert into public.qr_attribution_events(qr_code_id,location_id,business_id,user_id,action_type,source,metadata)
 values(v_qr.id,v_location,v_business,auth.uid(),coalesce(nullif(trim(p_action_type),''),'scan'),p_source,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.record_qr_attribution(text,text,text,jsonb) from public;
grant execute on function public.record_qr_attribution(text,text,text,jsonb) to anon,authenticated,service_role;
