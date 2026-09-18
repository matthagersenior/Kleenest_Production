-- Keep consumer quest progress behind the RPC boundary.
-- quest_my_active_progress was SECURITY INVOKER, so authenticated callers
-- needed direct SELECT privileges on quests and related private progression tables.
-- The function already scopes every row to auth.uid(); execute it as its owner
-- instead of broadening table grants.

alter function public.quest_my_active_progress(integer) security definer;
alter function public.quest_my_active_progress(integer)
  set search_path = public, auth, extensions, pg_temp;

revoke all on function public.quest_my_active_progress(integer) from public;
revoke all on function public.quest_my_active_progress(integer) from anon;
grant execute on function public.quest_my_active_progress(integer) to authenticated;
grant execute on function public.quest_my_active_progress(integer) to service_role;
