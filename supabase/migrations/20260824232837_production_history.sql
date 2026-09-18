grant execute on function public.admin_set_account_capabilities(uuid,text,text,boolean,boolean,boolean,text) to authenticated;
grant execute on function public.admin_set_user_access(uuid,boolean,text,text,boolean,text) to authenticated;
grant execute on function public.admin_set_business_tier(uuid,public.business_tier) to authenticated;
