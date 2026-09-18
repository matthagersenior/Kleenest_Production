grant execute on function public.admin_get_overview() to authenticated;
grant execute on function public.admin_crud_gateway(text,text,uuid,jsonb) to authenticated;
revoke execute on function public.admin_get_overview() from anon;
revoke execute on function public.admin_crud_gateway(text,text,uuid,jsonb) from anon;
