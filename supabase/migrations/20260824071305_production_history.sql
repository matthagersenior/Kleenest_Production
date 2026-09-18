revoke execute on function public.admin_operational_capability_catalog() from public;
revoke execute on function public.admin_crud_capability_catalog() from public;
revoke execute on function public.admin_authorization_v1(uuid) from public;
grant execute on function public.admin_operational_capability_catalog() to authenticated;
grant execute on function public.admin_crud_capability_catalog() to authenticated;
grant execute on function public.admin_authorization_v1(uuid) to authenticated;
