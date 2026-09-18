revoke execute on function public.current_user_id() from public, anon;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.redeem_promotion(uuid,uuid) from public, anon;
revoke execute on function public.reply_to_review(uuid,text) from public, anon;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.redeem_promotion(uuid,uuid) to authenticated;
grant execute on function public.reply_to_review(uuid,text) to authenticated;
