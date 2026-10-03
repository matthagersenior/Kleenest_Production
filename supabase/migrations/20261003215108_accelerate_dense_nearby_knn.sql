-- Accelerate ordinary dense-area nearby discovery with GiST KNN while preserving text-search semantics.
do $$
declare d text;
begin
 if to_regprocedure('kleenest_api_private.map_network_nearby_all_knn_v1(double precision,double precision,integer,integer,text)') is null then
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='kleenest_api_private' and p.proname='map_network_nearby_all_core_v1' limit 1;
  d:=replace(d,'map_network_nearby_all_core_v1','map_network_nearby_all_knn_v1');
  d:=replace(d,'from public.locations l left join public.place_compat_overrides o on o.location_id=l.id',
  'from (select * from public.locations q where q.is_active=true and q.geom is not null order by q.geom <-> v_origin limit p_limit) l left join public.place_compat_overrides o on o.location_id=l.id');
  execute d;
 end if;
 revoke all on function kleenest_api_private.map_network_nearby_all_knn_v1(double precision,double precision,integer,integer,text) from public,anon,authenticated;
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='kleenest_api_private' and p.proname='map_network_nearby_all_core_v1' limit 1;
 if position('map_network_nearby_all_knn_v1(p_lat,p_lng,p_radius_m,p_limit,null)' in d)=0 then
  d:=replace(d,'v_origin:=ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography;',
  'v_origin:=ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography;
 if nullif(trim(p_search),'''') is null then
   return query select * from kleenest_api_private.map_network_nearby_all_knn_v1(p_lat,p_lng,p_radius_m,p_limit,null);
   return;
 end if;');
  execute d;
 end if;
end $$;