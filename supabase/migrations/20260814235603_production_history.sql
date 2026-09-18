grant usage on schema private to authenticated;
grant execute on function private.current_user_business_role(uuid) to authenticated;
revoke execute on function private.current_user_business_role(uuid) from anon;
alter function private.current_user_business_role(uuid) security definer set search_path = public, private;

-- Verify the helper remains callable by the authenticated role while retaining
-- SECURITY DEFINER so the business_members policies do not recurse into RLS.
