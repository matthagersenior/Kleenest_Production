grant execute on function public.ensure_current_user_profile() to authenticated;
revoke execute on function public.ensure_current_user_profile() from anon;
