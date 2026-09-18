begin;
revoke execute on function public.business_create_event(uuid,text,text,date,time without time zone,uuid) from authenticated;
revoke execute on function public.business_create_event(uuid,text,text,uuid,date,time without time zone) from authenticated;
revoke execute on function public.business_create_promotion(uuid,text,text,numeric,uuid,timestamp with time zone,timestamp with time zone) from authenticated;
commit;
