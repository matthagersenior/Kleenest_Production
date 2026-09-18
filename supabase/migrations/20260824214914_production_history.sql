create or replace function public.redeem_qr_code(p_code text)
returns jsonb language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$
declare u uuid:=auth.uid(); q record; r integer; ci jsonb; v_attr uuid; v_location_id uuid; v_checkin_id uuid; v_redemption_id uuid;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into q from public.qr_codes where code=trim(p_code) and active=true for update;
 if q.id is null then raise exception 'Invalid or inactive QR code'; end if;
 select count(*) into r from public.qr_redemptions where qr_code_id=q.id;
 if q.max_redemptions is not null and r>=q.max_redemptions then raise exception 'QR redemption limit reached'; end if;
 if q.single_use and exists(select 1 from public.qr_redemptions where qr_code_id=q.id and user_id=u) then
   return jsonb_build_object('ok',true,'already_redeemed',true,'qr_code_id',q.id);
 end if;
 select p.id into v_location_id from public.places p where p.location_id=q.location_id and p.is_active=true limit 1;
 if v_location_id is null then raise exception 'QR location unavailable'; end if;
 ci:=public.create_check_in(v_location_id,q.code);
 v_checkin_id:=(ci->>'check_in_id')::uuid;
 begin
   insert into public.qr_redemptions(qr_code_id,user_id,check_in_id,metadata) values(q.id,u,v_checkin_id,jsonb_build_object('action_type',q.action_type)) returning id into v_redemption_id;
 exception when unique_violation then
   select id into v_redemption_id from public.qr_redemptions where qr_code_id=q.id and user_id=u;
   return ci||jsonb_build_object('qr_code_id',q.id,'redeemed',true,'already_redeemed',true,'redemption_id',v_redemption_id);
 end;
 v_attr:=public.record_qr_attribution(q.code,coalesce(nullif(trim(q.action_type),''),'check_in'),'qr_redeem',jsonb_build_object('qr_code_id',q.id,'check_in_id',v_checkin_id,'redemption_id',v_redemption_id));
 return ci||jsonb_build_object('qr_code_id',q.id,'redeemed',true,'attribution_id',v_attr,'redemption_id',v_redemption_id);
end $$;
