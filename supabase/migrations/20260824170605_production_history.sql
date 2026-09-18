begin;
alter function public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) security invoker;
alter function public.queue_offline_pack_event(uuid,text,jsonb,text) security invoker;
revoke execute on function public.create_offline_pack(text,text,uuid,uuid,double precision,double precision,double precision,double precision,integer) from anon;
revoke execute on function public.queue_offline_pack_event(uuid,text,jsonb,text) from anon;
commit;
