create or replace function public.create_check_in(p_place_id uuid, p_qr_token text default null) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare v_user uuid:=auth.uid(); v_location uuid; v_business uuid; v_check uuid; v_points integer:=10; v_qr uuid; v_eligible boolean; v_last_check timestamptz; v_last_departure timestamptz; v_today integer; begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select p.location_id,l.business_id into v_location,v_business from public.places p join public.locations l on l.id=p.location_id where p.id=p_place_id and p.is_active=true and l.is_active=true and l.verification_status='verified';
 if v_location is null then raise exception 'Place not found or not verified'; end if;
 if p_qr_token is not null and length(trim(p_qr_token))>0 then select id into v_qr from public.qr_codes where code=trim(p_qr_token) and active=true and location_id=v_location limit 1; if v_qr is null then raise exception 'Invalid or inactive QR code'; end if; end if;
 select max(checked_in_at) into v_last_check from public.check_ins where user_id=v_user and location_id=v_location;
 if v_last_check is not null then select max(left_at) into v_last_departure from public.location_departures where user_id=v_user and location_id=v_location and left_at>v_last_check; if v_last_departure is null then raise exception 'LEAVE_REQUIRED_BEFORE_REPEAT_CHECK_IN'; end if; end if;
 select count(*)::integer into v_today from public.point_transactions where user_id=v_user and reason in ('check_in','review') and created_at >= date_trunc('day',now()) and created_at < date_trunc('day',now())+interval '1 day';
 if v_today >= 5 then raise exception 'DAILY_PROGRESSION_CAP_REACHED'; end if;
 v_eligible:=true;
 insert into public.check_ins(user_id,location_id,qr_code_id,checked_in_at,verification_method,points_awarded,metadata) values(v_user,v_location,v_qr,now(),case when v_qr is null then 'place' else 'qr' end,v_points,jsonb_build_object('place_id',p_place_id,'server_authoritative',true,'progression_eligible',v_eligible)) returning id into v_check;
 return jsonb_build_object('ok',true,'already_checked_in',false,'check_in_id',v_check,'id',v_check,'location_id',v_location,'business_id',v_business,'qr_code_id',v_qr,'points_awarded',v_points,'progression_eligible',true,'place_id',p_place_id);
end $function$;

create or replace function public.kleenest_map_check_in(p_location_id uuid, p_lat double precision default null, p_lng double precision default null) returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare uid uuid:=auth.uid(); cid uuid; result jsonb; loc record; distance_m double precision; radius_m double precision; v_last_check timestamptz; v_last_departure timestamptz; v_today integer; begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'LOCATION_REQUIRED'; end if;
 select id,latitude,longitude,coalesce(geofence_radius_m,150)::double precision radius_m into loc from public.locations where id=p_location_id and is_active=true and verification_status='verified'; if not found then raise exception 'LOCATION_NOT_VERIFIED'; end if;
 if loc.latitude is null or loc.longitude is null then raise exception 'LOCATION_COORDINATES_UNAVAILABLE'; end if;
 radius_m:=greatest(25,least(coalesce(loc.radius_m,150),5000)); distance_m:=6371000.0*2*asin(sqrt(power(sin(radians(p_lat-loc.latitude)/2),2)+cos(radians(loc.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-loc.longitude)/2),2))); if distance_m>radius_m then raise exception 'OUTSIDE_GEOFENCE: distance=% radius=%',round(distance_m),round(radius_m); end if;
 select max(checked_in_at) into v_last_check from public.check_ins where user_id=uid and location_id=p_location_id;
 if v_last_check is not null then select max(left_at) into v_last_departure from public.location_departures where user_id=uid and location_id=p_location_id and left_at>v_last_check; if v_last_departure is null then raise exception 'LEAVE_REQUIRED_BEFORE_REPEAT_CHECK_IN'; end if; end if;
 select count(*)::integer into v_today from public.point_transactions where user_id=uid and reason in ('check_in','review') and created_at >= date_trunc('day',now()) and created_at < date_trunc('day',now())+interval '1 day'; if v_today>=5 then raise exception 'DAILY_PROGRESSION_CAP_REACHED'; end if;
 insert into public.check_ins(user_id,location_id,latitude,longitude,distance_meters,verification_method,points_awarded,metadata) values(uid,p_location_id,p_lat,p_lng,distance_m,'gps',10,jsonb_build_object('source','home_geofence','radius_meters',radius_m,'progression_eligible',true,'server_authoritative',true)) returning id into cid;
 return jsonb_build_object('success',true,'check_in_id',cid,'points_awarded',10,'progression_eligible',true,'distance_meters',distance_m,'geofence_radius_meters',radius_m);
end; $function$;

create or replace function public.create_review(p_location_id uuid, p_check_in_id uuid, p_stars smallint, p_cleanliness_pct numeric, p_comment text) returns public.reviews language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp' as $function$
declare v_review public.reviews; v_check timestamptz; v_eligible boolean; begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; if p_check_in_id is null then raise exception 'CHECK_IN_REQUIRED'; end if; if p_stars < 1 or p_stars > 5 then raise exception 'STARS_OUT_OF_RANGE'; end if; if p_cleanliness_pct is not null and (p_cleanliness_pct < 0 or p_cleanliness_pct > 100) then raise exception 'CLEANLINESS_OUT_OF_RANGE'; end if;
 select checked_in_at,coalesce((metadata->>'progression_eligible')::boolean,false) into v_check,v_eligible from public.check_ins where id=p_check_in_id and user_id=auth.uid() and location_id=p_location_id; if not found then raise exception 'CHECK_IN_DOES_NOT_BELONG_TO_USER_AND_LOCATION'; end if; if not v_eligible then raise exception 'CHECK_IN_NOT_ELIGIBLE_FOR_REVIEW'; end if;
 if exists(select 1 from public.reviews r where r.user_id=auth.uid() and r.check_in_id=p_check_in_id) then raise exception 'REVIEW_ALREADY_EXISTS_FOR_CHECK_IN'; end if;
 insert into public.reviews(location_id,user_id,check_in_id,stars,cleanliness_pct,comment,status) values(p_location_id,auth.uid(),p_check_in_id,p_stars,p_cleanliness_pct,nullif(trim(p_comment),''),'published') returning * into v_review; return v_review;
end; $function$;
