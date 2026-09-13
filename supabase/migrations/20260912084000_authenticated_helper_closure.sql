-- Close direct authenticated RPC access to helper-only SECURITY DEFINER functions.
-- Their intended use is through guarded owner/business wrappers.

revoke all on function public.national_ingestion_storage_status()
  from public, anon, authenticated;
grant execute on function public.national_ingestion_storage_status()
  to service_role;

revoke all on function public.business_enterprise_authorized(uuid)
  from public, anon, authenticated;
grant execute on function public.business_enterprise_authorized(uuid)
  to service_role;
