-- Close remaining live Business/Owner RPC execution and search-path gaps without changing product behavior.

alter function public.admin_authorization_v1(uuid) set search_path = '';
revoke all on function public.admin_authorization_v1(uuid) from public, anon;
grant execute on function public.admin_authorization_v1(uuid) to authenticated, service_role;

alter function public.admin_user_search(text) set search_path = '';
revoke all on function public.admin_user_search(text) from public, anon;
grant execute on function public.admin_user_search(text) to authenticated, service_role;

alter function public.business_search_claimable_locations(uuid, text, integer) set search_path = '';
revoke all on function public.business_search_claimable_locations(uuid, text, integer) from public, anon;
grant execute on function public.business_search_claimable_locations(uuid, text, integer) to authenticated, service_role;

alter function public.business_list_workspaces(boolean) set search_path = '';
revoke all on function public.business_list_workspaces(boolean) from public, anon;
grant execute on function public.business_list_workspaces(boolean) to authenticated, service_role;
