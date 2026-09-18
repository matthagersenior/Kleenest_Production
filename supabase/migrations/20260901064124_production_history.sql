revoke all on function public.national_ingestion_storage_status() from public, anon;
grant execute on function public.national_ingestion_storage_status() to authenticated, service_role;

revoke all on function public.admin_national_ingestion_status() from public, anon;
grant execute on function public.admin_national_ingestion_status() to authenticated;

revoke all on function public.admin_set_national_ingestion_resume_authorization(boolean) from public, anon;
grant execute on function public.admin_set_national_ingestion_resume_authorization(boolean) to authenticated;
