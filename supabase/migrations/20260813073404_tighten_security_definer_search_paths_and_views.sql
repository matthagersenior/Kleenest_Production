begin;
-- Make analytics views honor the caller's RLS context.
alter view public.partner_preferred_usage_analytics set (security_invoker = true);
alter view public.preferred_business_analytics set (security_invoker = true);
-- Pin every public SECURITY DEFINER function to a deterministic search_path.
do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('alter function %I.%I(%s) set search_path = public, pg_temp', r.schema_name, r.proname, r.args);
  end loop;
end $$;
commit;
