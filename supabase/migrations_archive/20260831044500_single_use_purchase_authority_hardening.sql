alter function public.list_single_use_access_purchases() set search_path = '';
revoke all on function public.list_single_use_access_purchases() from public, anon;
grant execute on function public.list_single_use_access_purchases() to authenticated;
