-- Remove accidental anonymous access inherited through PUBLIC EXECUTE.
-- This RPC is part of signed-in business account authority.

revoke all on function public.get_business_location_cap(uuid)
  from public, anon;

grant execute on function public.get_business_location_cap(uuid)
  to authenticated, service_role;
