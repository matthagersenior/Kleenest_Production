create or replace function public.resolve_custom_qr_action(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_qr public.qr_codes%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_qr from public.qr_codes where code=p_qr_code and active=true limit 1;
 if not found then raise exception 'Invalid or inactive Kleenest QR'; end if;
 return jsonb_build_object('id',v_qr.id,'code',v_qr.code,'location_id',v_qr.location_id,'business_id',v_qr.business_id,'label',v_qr.label,'purpose',v_qr.purpose,'action_type',lower(coalesce(v_qr.action_type,'checkin')),'action_payload',coalesce(v_qr.action_payload,'{}'::jsonb),'single_use',coalesce(v_qr.single_use,false));
end; $$;
grant execute on function public.resolve_custom_qr_action(text) to authenticated;
