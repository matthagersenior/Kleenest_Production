create or replace function public.create_check_in(p_place_id uuid, p_qr_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid(); v_location uuid; v_business uuid; v_check uuid; v_points integer := 10; v_existing uuid; v_qr uuid; v_event_key text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select p.location_id,l.business_id into v_location,v_business from public.places p join public.locations l on l.id=p.location_id where p.id=p_place_id and p.is_active=true;
  if v_location is null then raise exception 'Place not found'; end if;
  if p_qr_token is not null and length(trim(p_qr_token))>0 then
    select id into v_qr from public.qr_codes where code=trim(p_qr_token) and active=true and location_id=v_location limit 1;
    if v_qr is null then raise exception 'Invalid or inactive QR code'; end if;
  end if;
  select id into v_existing from public.check_ins where user_id=v_user and location_id=v_location and checked_in_at > now()-interval '24 hours' limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok',true,'already_checked_in',true,'check_in_id',v_existing,'id',v_existing,'location_id',v_location,'business_id',v_business,'qr_code_id',v_qr,'points_awarded',0,'place_id',p_place_id);
  end if;
  insert into public.check_ins(user_id,location_id,qr_code_id,checked_in_at,verification_method,points_awarded,metadata)
  values(v_user,v_location,v_qr,now(),case when v_qr is null then 'place' else 'qr' end,v_points,jsonb_build_object('place_id',p_place_id)) returning id into v_check;
  insert into public.reward_transactions(user_id,check_in_id,points,reason,metadata) values(v_user,v_check,v_points,'check_in',jsonb_build_object('place_id',p_place_id,'qr',v_qr is not null));
  update public.profiles set points=coalesce(points,0)+v_points,total_check_ins=coalesce(total_check_ins,0)+1,level=greatest(1,floor((coalesce(points,0)+v_points)/100)+1)::int,updated_at=now() where id=v_user;
  v_event_key:=md5(concat_ws('|',v_user::text,'check_in',v_check::text,v_location::text));
  insert into public.data_feature_events(subject_type,subject_id,actor_user_id,location_id,event_type,feature_code,source_table,source_id,value_numeric,metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context)
  values('location',v_location,v_user,v_location,'check_in','location_checkin','check_ins',v_check,v_points,jsonb_build_object('place_id',p_place_id,'business_id',v_business,'qr',v_qr is not null,'server_authoritative',true),now(),'valid',1,v_event_key,jsonb_build_object('server_authoritative',true));
  return jsonb_build_object('ok',true,'already_checked_in',false,'check_in_id',v_check,'id',v_check,'location_id',v_location,'business_id',v_business,'qr_code_id',v_qr,'points_awarded',v_points,'place_id',p_place_id);
end
$function$;
