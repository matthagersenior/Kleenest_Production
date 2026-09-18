create table if not exists public.national_ingestion_storage_guard (
  singleton boolean primary key default true check (singleton),
  allocation_bytes bigint not null default 2147483648,
  pause_fraction numeric(5,4) not null default 0.5000 check (pause_fraction > 0 and pause_fraction < 1),
  hard_stop_fraction numeric(5,4) not null default 0.8000 check (hard_stop_fraction > pause_fraction and hard_stop_fraction <= 1),
  paused boolean not null default false,
  pause_reason text,
  paused_at timestamptz,
  resume_authorized boolean not null default false,
  resume_authorized_at timestamptz,
  resume_authorized_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.national_ingestion_storage_guard(singleton) values(true) on conflict(singleton) do nothing;

alter table public.national_ingestion_storage_guard enable row level security;
revoke all on public.national_ingestion_storage_guard from public, anon, authenticated;

create or replace function public.national_ingestion_storage_status()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  g public.national_ingestion_storage_guard%rowtype;
  db_bytes bigint;
  wal_bytes bigint;
  observed_bytes bigint;
  observed_fraction numeric;
  auto_pause boolean;
  hard_stop boolean;
begin
  select * into g from public.national_ingestion_storage_guard where singleton=true;
  select pg_database_size(current_database()) into db_bytes;
  begin
    select coalesce(sum(size),0)::bigint into wal_bytes from pg_ls_waldir();
  exception when others then
    wal_bytes:=0;
  end;
  observed_bytes:=coalesce(db_bytes,0)+coalesce(wal_bytes,0);
  observed_fraction:=case when g.allocation_bytes>0 then observed_bytes::numeric/g.allocation_bytes else 1 end;
  hard_stop:=observed_fraction>=g.hard_stop_fraction;
  auto_pause:=observed_fraction>=g.pause_fraction and not g.resume_authorized;

  if hard_stop then
    update public.national_ingestion_storage_guard
      set paused=true,pause_reason='hard_stop_storage_threshold',paused_at=coalesce(paused_at,now()),updated_at=now()
      where singleton=true;
  elsif auto_pause then
    update public.national_ingestion_storage_guard
      set paused=true,pause_reason='storage_threshold_50_percent',paused_at=coalesce(paused_at,now()),updated_at=now()
      where singleton=true;
  elsif g.resume_authorized and g.paused and not hard_stop then
    update public.national_ingestion_storage_guard
      set paused=false,pause_reason=null,paused_at=null,updated_at=now()
      where singleton=true;
  end if;

  select * into g from public.national_ingestion_storage_guard where singleton=true;
  return jsonb_build_object(
    'allocation_bytes',g.allocation_bytes,
    'pause_fraction',g.pause_fraction,
    'hard_stop_fraction',g.hard_stop_fraction,
    'database_bytes',db_bytes,
    'wal_bytes',wal_bytes,
    'observed_bytes',observed_bytes,
    'observed_fraction',round(observed_fraction,4),
    'observed_percent',round(observed_fraction*100,2),
    'paused',g.paused,
    'pause_reason',g.pause_reason,
    'paused_at',g.paused_at,
    'resume_authorized',g.resume_authorized,
    'resume_authorized_at',g.resume_authorized_at,
    'hard_stop',hard_stop,
    'may_ingest',not g.paused and not hard_stop
  );
end;
$$;

create or replace function public.admin_set_national_ingestion_resume_authorization(p_authorized boolean)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  uid uuid:=auth.uid();
begin
  if uid is null or not public.is_platform_owner(uid) then raise exception 'Platform owner access required'; end if;
  update public.national_ingestion_storage_guard
    set resume_authorized=coalesce(p_authorized,false),
        resume_authorized_at=case when p_authorized then now() else null end,
        resume_authorized_by=case when p_authorized then uid else null end,
        paused=case when p_authorized then false else paused end,
        pause_reason=case when p_authorized then null else pause_reason end,
        paused_at=case when p_authorized then null else paused_at end,
        updated_at=now()
    where singleton=true;
  return public.national_ingestion_storage_status();
end;
$$;

revoke all on function public.national_ingestion_storage_status() from public,anon;
grant execute on function public.national_ingestion_storage_status() to authenticated,service_role;
revoke all on function public.admin_set_national_ingestion_resume_authorization(boolean) from public,anon;
grant execute on function public.admin_set_national_ingestion_resume_authorization(boolean) to authenticated;
