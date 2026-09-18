-- Harmless production deployment probe for the native Supabase GitHub integration.
-- The migration intentionally changes no application schema; successful application is recorded in the migration ledger.
do $$
begin
  perform 1;
end
$$;
