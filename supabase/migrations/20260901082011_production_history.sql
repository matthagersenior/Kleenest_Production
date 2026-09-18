revoke execute on function public.get_business_product_access(uuid) from public, anon;
grant execute on function public.get_business_product_access(uuid) to authenticated, service_role;
