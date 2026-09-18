revoke execute on function public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) from public;
revoke execute on function public.populate_route_discovery_cache(uuid,jsonb) from public;
revoke execute on function public.prepare_route_discovery(uuid,integer,integer) from public;
revoke execute on function public.submit_feedback(text,text,text,text,jsonb) from public;
revoke execute on function public.touch_updated_at() from public;
grant execute on function public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) to authenticated;
grant execute on function public.populate_route_discovery_cache(uuid,jsonb) to authenticated;
grant execute on function public.prepare_route_discovery(uuid,integer,integer) to authenticated;
grant execute on function public.submit_feedback(text,text,text,text,jsonb) to authenticated;
