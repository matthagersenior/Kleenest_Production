alter function public.business_location_metrics(uuid,uuid,text,timestamptz,timestamptz) set search_path = public, pg_temp;
alter function public.business_reply_review(uuid,uuid,text) set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
