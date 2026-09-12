-- Future public functions must be private-by-default.
-- Existing function ACLs are unchanged; migrations must explicitly grant client EXECUTE.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
