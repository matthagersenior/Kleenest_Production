do $$
declare r record;
begin
  for r in
    select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('authenticated',p.oid,'execute') as had_authenticated
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %I.%I(%s) from public',r.nspname,r.proname,r.args);
    execute format('revoke execute on function %I.%I(%s) from anon',r.nspname,r.proname,r.args);
    if r.had_authenticated then
      execute format('grant execute on function %I.%I(%s) to authenticated',r.nspname,r.proname,r.args);
    end if;
  end loop;
end $$;
