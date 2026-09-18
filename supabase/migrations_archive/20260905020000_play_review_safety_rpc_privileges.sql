-- Restrict Play-review safety RPCs to signed-in callers.
-- Each function also validates auth.uid(), but explicit grants keep the API surface least-privileged.

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.report_user(uuid, text, text, text) from public, anon;
revoke all on function public.enforce_direct_message_block() from public, anon, authenticated;

grant execute on function public.block_user(uuid) to authenticated, service_role;
grant execute on function public.unblock_user(uuid) to authenticated, service_role;
grant execute on function public.report_user(uuid, text, text, text) to authenticated, service_role;
