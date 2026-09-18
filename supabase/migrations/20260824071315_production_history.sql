revoke execute on function public.create_intelligence_action_link(uuid,uuid,text,text,text,jsonb) from public;
revoke execute on function public.execute_intelligence_action(uuid) from public;
revoke execute on function public.complete_intelligence_action(uuid,jsonb) from public;
revoke execute on function public.publish_location_notification(text,uuid,jsonb,text,timestamptz) from public;
revoke execute on function public.send_prioritized_notification_batch(uuid,uuid[],text,text,text,jsonb) from public;
grant execute on function public.create_intelligence_action_link(uuid,uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.execute_intelligence_action(uuid) to authenticated;
grant execute on function public.complete_intelligence_action(uuid,jsonb) to authenticated;
