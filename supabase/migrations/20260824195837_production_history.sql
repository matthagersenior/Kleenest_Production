revoke execute on function public.quest_record_step(uuid,uuid,text,text,jsonb,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.quest_record_step(uuid,uuid,text,text,jsonb,uuid,uuid,uuid,uuid) to authenticated;
revoke execute on function public.quest_start(uuid) from public,anon;
grant execute on function public.quest_start(uuid) to authenticated;
revoke execute on function public.quest_advance_activity(uuid,text,uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.quest_advance_activity(uuid,text,uuid,uuid,uuid,uuid,jsonb) to authenticated;
