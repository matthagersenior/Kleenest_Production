create table if not exists public.external_ingestion_runtime (
  singleton boolean primary key default true check(singleton),
  lease_owner text,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.external_ingestion_runtime(singleton) values(true) on conflict(singleton) do nothing;
alter table public.external_ingestion_runtime enable row level security;
revoke all on public.external_ingestion_runtime from anon, authenticated;
grant select,insert,update on public.external_ingestion_runtime to service_role;

create or replace function public.try_acquire_external_ingestion_lease(p_owner text, p_ttl_seconds integer default 90)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_now timestamptz:=now(); v_ttl int:=greatest(30,least(coalesce(p_ttl_seconds,90),180)); v_ok boolean:=false;
begin
  update public.external_ingestion_runtime
     set lease_owner=p_owner, lease_until=v_now+make_interval(secs=>v_ttl), updated_at=v_now
   where singleton=true and (lease_until is null or lease_until<v_now or lease_owner=p_owner);
  get diagnostics v_ok = row_count;
  return v_ok;
end;
$$;
revoke all on function public.try_acquire_external_ingestion_lease(text,integer) from public, anon, authenticated;
grant execute on function public.try_acquire_external_ingestion_lease(text,integer) to service_role, postgres;

update public.external_ingestion_adapters
set next_run_at=now()
where enabled=true;
