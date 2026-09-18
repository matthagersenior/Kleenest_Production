alter function public.apply_user_amenity_confirmation() set search_path = '';
revoke all on function public.apply_user_amenity_confirmation() from public, anon, authenticated;
grant execute on function public.apply_user_amenity_confirmation() to service_role;

alter function public.refresh_restroom_observation_intelligence_trigger() set search_path = '';
revoke all on function public.refresh_restroom_observation_intelligence_trigger() from public, anon, authenticated;
grant execute on function public.refresh_restroom_observation_intelligence_trigger() to service_role;

alter function public.validate_location_photo_checkin_attribution() set search_path = '';
revoke all on function public.validate_location_photo_checkin_attribution() from public, anon, authenticated;
grant execute on function public.validate_location_photo_checkin_attribution() to service_role;

alter function public.reporting_schedule_init() set search_path = '';
revoke all on function public.reporting_schedule_init() from public, anon, authenticated;
grant execute on function public.reporting_schedule_init() to service_role;

alter function public.is_qualifying_return_visit(uuid, uuid, timestamp with time zone) set search_path = '';
revoke all on function public.is_qualifying_return_visit(uuid, uuid, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.is_qualifying_return_visit(uuid, uuid, timestamp with time zone) to service_role;

alter function public.is_qualifying_return_visit(uuid, uuid, timestamp with time zone, uuid) set search_path = '';
revoke all on function public.is_qualifying_return_visit(uuid, uuid, timestamp with time zone, uuid) from public, anon, authenticated;
grant execute on function public.is_qualifying_return_visit(uuid, uuid, timestamp with time zone, uuid) to service_role;

alter function public.quest_advance_activity(uuid, text, uuid, uuid, uuid, uuid, jsonb) set search_path = '';
revoke all on function public.quest_advance_activity(uuid, text, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quest_advance_activity(uuid, text, uuid, uuid, uuid, uuid, jsonb) to service_role;

alter function public.quest_dispatch_event(uuid, text, uuid, uuid, uuid, uuid, jsonb) set search_path = '';
revoke all on function public.quest_dispatch_event(uuid, text, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quest_dispatch_event(uuid, text, uuid, uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.run_due_reporting_schedules(uuid) from public, anon, authenticated;
grant execute on function public.run_due_reporting_schedules(uuid) to service_role;
