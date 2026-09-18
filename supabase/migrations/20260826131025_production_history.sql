create or replace function public.capability_retirement_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.capability_retirement_log(
    capability_key,
    retired_at,
    reason
  ) values (
    coalesce(new.capability_key, old.capability_key),
    now(),
    'capability retirement audit'
  );
  return coalesce(new, old);
end;
$$;
