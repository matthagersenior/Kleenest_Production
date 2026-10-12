-- Privileged helpers live outside the exposed API schema. Public entry points
-- preserve their existing signatures and invoke narrowly granted private helpers.
alter function public.record_app_activity(text) set schema private;
alter function public.owner_user_tally_snapshot() set schema private;
grant usage on schema private to anon,authenticated;
revoke all on function private.record_app_activity(text) from public;
revoke all on function private.owner_user_tally_snapshot() from public,anon;
grant execute on function private.record_app_activity(text) to anon,authenticated;
grant execute on function private.owner_user_tally_snapshot() to authenticated;

create function public.record_app_activity(p_guest_session text default null) returns void
language sql security invoker set search_path='' as $$
  select private.record_app_activity(p_guest_session);
$$;
revoke all on function public.record_app_activity(text) from public;
grant execute on function public.record_app_activity(text) to anon,authenticated;

create function public.owner_user_tally_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.owner_user_tally_snapshot();
$$;
revoke all on function public.owner_user_tally_snapshot() from public,anon;
grant execute on function public.owner_user_tally_snapshot() to authenticated;

-- Explicitly deny direct access, even if a table grant is added later.
create policy user_tally_rpc_only on private.user_tally_daily as restrictive
for all to anon,authenticated using(false) with check(false);
create policy user_tally_rpc_only on private.user_tally_activity as restrictive
for all to anon,authenticated using(false) with check(false);
create policy user_tally_rpc_only on private.user_tally_guest_activity as restrictive
for all to anon,authenticated using(false) with check(false);
create policy user_tally_rpc_only on private.user_tally_tracking as restrictive
for all to anon,authenticated using(false) with check(false);
