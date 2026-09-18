revoke all on function public.ensure_signup_profile(text,text,text,text,boolean) from public, anon;
grant execute on function public.ensure_signup_profile(text,text,text,text,boolean) to authenticated, service_role;
