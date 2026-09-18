create table if not exists public.focus_ingestion_runtime (
  singleton boolean primary key default true check (singleton),
  lease_owner text,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.focus_ingestion_runtime(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.focus_ingestion_runtime enable row level security;
revoke all on table public.focus_ingestion_runtime from anon, authenticated;
grant select, insert, update on table public.focus_ingestion_runtime to service_role;

create or replace function public.try_acquire_focus_ingestion_lease(p_owner text, p_ttl_seconds integer default 55)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean := false;
begin
  update public.focus_ingestion_runtime
     set lease_owner = p_owner,
         lease_until = now() + make_interval(secs => greatest(15, least(coalesce(p_ttl_seconds,55),120))),
         updated_at = now()
   where singleton = true
     and (lease_until is null or lease_until < now() or lease_owner = p_owner)
  returning true into acquired;
  return coalesce(acquired,false);
end;
$$;

revoke all on function public.try_acquire_focus_ingestion_lease(text,integer) from public, anon, authenticated;
grant execute on function public.try_acquire_focus_ingestion_lease(text,integer) to service_role;
