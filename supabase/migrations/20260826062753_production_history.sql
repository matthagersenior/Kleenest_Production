revoke execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) from public, anon;
revoke execute on function public.prepare_universal_location_discovery(double precision,double precision,integer,uuid,text,text,integer) from public, anon;
grant execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) to authenticated;
grant execute on function public.prepare_universal_location_discovery(double precision,double precision,integer,uuid,text,text,integer) to authenticated;
