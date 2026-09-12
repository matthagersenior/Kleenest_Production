-- Future functions created by postgres must be private-by-default.
-- PostgreSQL's built-in PUBLIC EXECUTE default is global, so revoke it globally.
-- Public-schema anon/authenticated access must then be granted explicitly per RPC.

alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
