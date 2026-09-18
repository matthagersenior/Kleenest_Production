revoke all on function public.admin_set_business_access(uuid,business_tier,boolean,boolean,text) from public,anon;
grant execute on function public.admin_set_business_access(uuid,business_tier,boolean,boolean,text) to authenticated;
revoke all on function public.admin_assign_business_member(uuid,uuid,business_member_role) from public,anon;
grant execute on function public.admin_assign_business_member(uuid,uuid,business_member_role) to authenticated;
revoke all on function public.record_location_discovery_event(double precision,double precision,numeric,text[],integer) from public,anon;
grant execute on function public.record_location_discovery_event(double precision,double precision,numeric,text[],integer) to authenticated;
