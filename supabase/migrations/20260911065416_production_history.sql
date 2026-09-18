-- Keep onboarding recommendation internals authenticated-only.
revoke all on function public.business_onboarding_build_experience(text,text[],jsonb,jsonb) from public,anon;
grant execute on function public.business_onboarding_build_experience(text,text[],jsonb,jsonb) to authenticated,service_role;
