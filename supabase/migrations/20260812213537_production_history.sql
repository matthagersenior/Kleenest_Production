-- Keep SECURITY DEFINER only where the function must cross RLS boundaries.
-- Explicitly pin the trusted search path and prevent callers from changing it.
alter function public.reply_to_review(uuid,text) set search_path = public;
alter function public.verify_checkin(text,double precision,double precision) set search_path = public, extensions;

-- No anonymous access to privileged functions.
revoke execute on function public.reply_to_review(uuid,text) from anon;
revoke execute on function public.verify_checkin(text,double precision,double precision) from anon;
grant execute on function public.reply_to_review(uuid,text) to authenticated;
grant execute on function public.verify_checkin(text,double precision,double precision) to authenticated;

-- Keep public discovery functions available to visitors.
grant execute on function public.nearby_locations(double precision,double precision,integer,integer) to anon, authenticated;
grant execute on function public.search_locations(text,integer) to anon, authenticated;
