-- Close direct RPC access to internal SECURITY DEFINER helper/trigger functions.
-- Their intended use is indirect: nested community functions and table triggers.

revoke all on function public.enforce_ugc_policy_acceptance()
  from public, anon, authenticated;
grant execute on function public.enforce_ugc_policy_acceptance()
  to service_role;

revoke all on function public.users_have_block_relationship(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.users_have_block_relationship(uuid,uuid)
  to service_role;
