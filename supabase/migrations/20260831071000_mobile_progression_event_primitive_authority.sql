alter function public.record_progression_action(text, uuid) set search_path = '';
revoke all on function public.record_progression_action(text, uuid) from public, anon, authenticated;
grant execute on function public.record_progression_action(text, uuid) to service_role;

alter function public.quest_record_step(uuid, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) set search_path = '';
revoke all on function public.quest_record_step(uuid, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.quest_record_step(uuid, uuid, text, text, jsonb, uuid, uuid, uuid, uuid) to service_role;
