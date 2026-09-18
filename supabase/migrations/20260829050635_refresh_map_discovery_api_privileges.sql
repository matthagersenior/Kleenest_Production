revoke execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) from public;
grant execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) to anon, authenticated;
notify pgrst, 'reload schema';
