revoke execute on function public.mark_message_read(uuid) from public;
revoke execute on function public.get_cross_tier_leaderboard(text,integer) from public;
grant execute on function public.get_cross_tier_leaderboard(text,integer) to authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
