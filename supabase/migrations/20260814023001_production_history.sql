revoke execute on function public.ensure_signup_profile(text,text,text,text,boolean) from anon, public;
revoke execute on function public.update_my_profile(text,text,text,text) from anon, public;
grant execute on function public.ensure_signup_profile(text,text,text,text,boolean) to authenticated;
grant execute on function public.update_my_profile(text,text,text,text) to authenticated;
