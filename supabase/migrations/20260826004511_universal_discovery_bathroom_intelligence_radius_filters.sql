drop function if exists public.prepare_universal_location_discovery(double precision,double precision,integer,uuid);

create or replace function public.prepare_universal_location_discovery(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 16093,
  p_user_id uuid default auth.uid(),
  p_category text default null,
  p_search text default null,
  p_limit integer default 1000
) returns jsonb
language plpgsql security definer
set search_path=public,auth,extensions,pg_temp
as $function$
declare
 v_radius integer:=greatest(1000,least(coalesce(p_radius_m,16093),80467));
 v_limit integer:=greatest(25,least(coalesce(p_limit,1000),2000));
 v_tier text; v_session uuid; v_locations jsonb; v_lat_delta double precision; v_lng_delta double precision;
 v_category text:=nullif(trim(lower(coalesce(p_category,''))),'');
 v_search text:=nullif(trim(lower(coalesce(p_search,''))),'');
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_user_id is distinct from auth.uid() then raise exception 'User identity mismatch'; end if;
 if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then raise exception 'valid coordinates required'; end if;
 select subscription_tier::text into v_tier from profiles where id=auth.uid();
 insert into user_location_sessions(user_id,latitude,longitude,radius_meters,tier_code) values(auth.uid(),p_lat,p_lng,v_radius,v_tier) returning id into v_session;
 v_lat_delta:=v_radius/111320.0;
 v_lng_delta:=v_radius/(111320.0*greatest(cos(radians(p_lat)),0.1));
 select coalesce(jsonb_agg(to_jsonb(x) order by x.distance_meters),'[]'::jsonb) into v_locations
 from (
   select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,l.place_type,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
          l.verification_status,l.bathroom_verification_status,l.accessible,l.changing_table,l.cleanliness,l.cleanliness_pct,l.rating,l.review_count,l.updated_at,
          coalesce(bi.status,case when l.bathroom_verification_status in('verified','confirmed') then 'confirmed' when l.place_type='restroom' then 'likely' else 'unknown' end) bathroom_status,
          coalesce(bi.access,'unknown') bathroom_access,
          coalesce(bi.confidence,case when l.bathroom_verification_status in('verified','confirmed') then 95 when l.place_type='restroom' then 85 else 0 end) bathroom_confidence,
          coalesce(bi.evidence_count,0) bathroom_evidence_count,
          round((6371000*2*asin(sqrt(power(sin(radians(l.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(l.latitude))*power(sin(radians(l.longitude-p_lng)/2),2))))::numeric,1) distance_meters
   from locations l
   left join location_bathroom_intelligence bi on bi.location_id=l.id
   where l.is_active=true
     and l.latitude between p_lat-v_lat_delta and p_lat+v_lat_delta
     and l.longitude between p_lng-v_lng_delta and p_lng+v_lng_delta
     and (v_category is null or lower(coalesce(l.place_type,''))=v_category or (v_category='shopping' and lower(coalesce(l.place_type,'')) in('retail','shopping')) or (v_category='gas_station' and lower(coalesce(l.place_type,''))='gas'))
     and (v_search is null or lower(coalesce(l.name,'')) like '%'||v_search||'%' or lower(coalesce(l.address,'')) like '%'||v_search||'%' or lower(coalesce(l.city,'')) like '%'||v_search||'%' or lower(coalesce(l.place_type,'')) like '%'||v_search||'%' or lower(coalesce(l.source_metadata::text,'')) like '%'||v_search||'%')
   order by distance_meters limit v_limit
 ) x where x.distance_meters<=v_radius;
 update user_location_sessions set last_seen_at=now(),metadata=jsonb_build_object('location_count',jsonb_array_length(v_locations),'category',v_category,'search',v_search,'radius_miles',round((v_radius/1609.344)::numeric,2)) where id=v_session;
 return jsonb_build_object('session_id',v_session,'tier',coalesce(v_tier,'free'),'radius_meters',v_radius,'radius_miles',round((v_radius/1609.344)::numeric,2),'category',v_category,'search',v_search,'locations',v_locations,'needs_external_discovery',jsonb_array_length(v_locations)=0,'data_policy','universal_discovery_v2');
end $function$;

grant execute on function public.prepare_universal_location_discovery(double precision,double precision,integer,uuid,text,text,integer) to authenticated;
