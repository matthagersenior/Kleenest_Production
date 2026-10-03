CREATE OR REPLACE FUNCTION public.prepare_universal_location_discovery(p_lat double precision, p_lng double precision, p_radius_m integer DEFAULT 16093, p_user_id uuid DEFAULT auth.uid(), p_category text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
 v_radius integer:=greatest(1000,least(coalesce(p_radius_m,16093),80467));
 v_limit integer:=greatest(25,least(coalesce(p_limit,1000),2000));
 v_user uuid:=auth.uid(); v_tier text:='free'; v_locations jsonb; v_hydration jsonb;
 v_category text:=nullif(trim(lower(coalesce(p_category,''))),'');
begin
 if v_user is not null and p_user_id is distinct from v_user then raise exception 'User identity mismatch'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'valid coordinates required'; end if;
 if v_user is not null then select coalesce(subscription_tier::text,'free') into v_tier from public.profiles where id=v_user; end if;
 select coalesce(jsonb_agg(row_value order by coalesce((row_value->>'distance_meters')::numeric,0)),'[]'::jsonb)
 into v_locations
 from (
  select row_value from public.map_network_nearby_all_v1(p_lat,p_lng,v_radius,v_limit,p_search) row_value
  where v_category is null
     or lower(coalesce(row_value->>'place_type',''))=v_category
     or (v_category='shopping' and lower(coalesce(row_value->>'place_type','')) in ('retail','shopping'))
     or (v_category='gas_station' and lower(coalesce(row_value->>'place_type','')) in ('gas','gas_station'))
 ) s;
 if jsonb_array_length(v_locations)=0 then v_hydration:=public.enqueue_place_discovery_hydration(p_lat,p_lng,least(v_radius,40234)); end if;
 return jsonb_build_object('session_id',null,'tier',coalesce(v_tier,'free'),'radius_meters',v_radius,'radius_miles',round((v_radius/1609.344)::numeric,2),'category',v_category,'search',nullif(trim(lower(coalesce(p_search,''))),''),'locations',v_locations,'needs_external_discovery',jsonb_array_length(v_locations)=0,'hydration',v_hydration,'data_policy','universal_discovery_v4');
end $function$

