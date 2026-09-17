create or replace function public.production_migration_applied(p_version text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from supabase_migrations.schema_migrations m
    where m.version = p_version
  );
$$;

revoke all on function public.production_migration_applied(text) from public;
grant execute on function public.production_migration_applied(text) to anon, authenticated;

comment on function public.production_migration_applied(text) is
  'Release-readiness probe: returns only whether a migration version is recorded in the production Supabase migration ledger.';
