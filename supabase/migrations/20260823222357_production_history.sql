revoke execute on function public.sync_business_service_entitlement(uuid) from anon, authenticated;
revoke execute on function public.account_effective_business_tier(uuid) from anon;
grant execute on function public.account_effective_business_tier(uuid) to authenticated;
