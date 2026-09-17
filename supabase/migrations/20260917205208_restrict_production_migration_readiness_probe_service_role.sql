revoke all on function public.production_migration_applied(text) from public;
revoke all on function public.production_migration_applied(text) from anon;
revoke all on function public.production_migration_applied(text) from authenticated;
grant execute on function public.production_migration_applied(text) to service_role;

comment on function public.production_migration_applied(text) is
  'Internal production migration-ledger readiness probe. Execute is restricted to service_role; external CI verification must pass through the GitHub OIDC-validated Edge Function.';
