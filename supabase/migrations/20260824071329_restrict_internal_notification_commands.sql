revoke execute on function public.publish_location_notification(text,uuid,jsonb,text,timestamptz) from authenticated;
revoke execute on function public.send_prioritized_notification_batch(uuid,uuid[],text,text,text,jsonb) from authenticated;
