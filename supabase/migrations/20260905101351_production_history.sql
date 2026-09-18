-- Harden the legacy authorities directly used by the Owner ingestion and Live Network notification control planes.
alter function public.is_platform_owner(uuid) set search_path='';
alter function public.admin_national_ingestion_status() set search_path='';
alter function public.admin_set_national_ingestion_resume_authorization(boolean) set search_path='';
alter function public.create_intelligence_notification(uuid,uuid,text,text,text,text,text,jsonb,integer) set search_path='';
alter function public.queue_intelligence_notification_jobs() set search_path='';
alter function public.process_intelligence_notification_jobs(integer) set search_path='';
alter function public.publish_location_notification(text,uuid,jsonb,text,timestamptz) set search_path='';

-- Push token functions were already hardened; keep an explicit least-privilege execution boundary.
revoke execute on function public.register_notification_native_push_token(text,text,text) from public,anon;
revoke execute on function public.remove_notification_native_push_token(text) from public,anon;
grant execute on function public.register_notification_native_push_token(text,text,text) to authenticated,service_role;
grant execute on function public.remove_notification_native_push_token(text) to authenticated,service_role;

-- Internal queue processor is not a consumer-facing API.
revoke execute on function public.queue_intelligence_notification_jobs() from public,anon,authenticated;
revoke execute on function public.process_intelligence_notification_jobs(integer) from public,anon,authenticated;
grant execute on function public.queue_intelligence_notification_jobs() to service_role;
grant execute on function public.process_intelligence_notification_jobs(integer) to service_role;
