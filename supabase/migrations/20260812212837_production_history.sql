-- These two functions expose caller identity and mutate caller-owned notifications.
-- Neither should be callable by anonymous clients.
revoke execute on function public.current_user_id() from anon;
revoke execute on function public.mark_notification_read(uuid) from anon;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- Promotion redemption requires an authenticated user because it creates a user-owned redemption.
revoke execute on function public.redeem_promotion(uuid,uuid) from anon;
grant execute on function public.redeem_promotion(uuid,uuid) to authenticated;

-- Business review replies are authenticated business actions.
revoke execute on function public.reply_to_review(uuid,text) from anon;
grant execute on function public.reply_to_review(uuid,text) to authenticated;
