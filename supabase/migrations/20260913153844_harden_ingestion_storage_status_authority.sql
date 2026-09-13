
create or replace function public.national_ingestion_storage_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  g public.national_ingestion_storage_guard%rowtype;
  db_bytes bigint;
  wal_bytes bigint;
  disk_observed_bytes bigint;
  database_fraction numeric;
  disk_fraction numeric;
  disk_pause_fraction numeric:=0.90;
  disk_hard_stop_fraction numeric:=0.95;
  auto_pause boolean;
  hard_stop boolean;
  pause_reason_text text;
begin
  if session_user <> 'postgres'
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not coalesce(public.is_platform_owner(auth.uid()),false) then
    raise exception 'Platform owner or service role required' using errcode='42501';
  end if;

  select * into g
  from public.national_ingestion_storage_guard
  where singleton=true;

  select pg_database_size(current_database()) into db_bytes;

  begin
    select coalesce(sum(size),0)::bigint into wal_bytes from pg_ls_waldir();
  exception when others then
    wal_bytes:=0;
  end;

  disk_observed_bytes:=coalesce(db_bytes,0)+coalesce(wal_bytes,0);
  database_fraction:=case when g.allocation_bytes>0 then db_bytes::numeric/g.allocation_bytes else 1 end;
  disk_fraction:=case when g.allocation_bytes>0 then disk_observed_bytes::numeric/g.allocation_bytes else 1 end;
  hard_stop:=database_fraction>=g.hard_stop_fraction or disk_fraction>=disk_hard_stop_fraction;
  auto_pause:=(database_fraction>=g.pause_fraction or disk_fraction>=disk_pause_fraction) and not g.resume_authorized;

  pause_reason_text:=case
    when database_fraction>=g.hard_stop_fraction then 'free_plan_database_hard_stop_85_percent'
    when disk_fraction>=disk_hard_stop_fraction then 'disk_observed_hard_stop_95_percent'
    when database_fraction>=g.pause_fraction then 'free_plan_database_pause_70_percent'
    when disk_fraction>=disk_pause_fraction then 'disk_observed_pause_90_percent'
    else null
  end;

  if hard_stop then
    update public.national_ingestion_storage_guard
       set paused=true,
           pause_reason=pause_reason_text,
           paused_at=coalesce(paused_at,now()),
           resume_authorized=false,
           resume_authorized_at=null,
           updated_at=now()
     where singleton=true;
  elsif auto_pause then
    update public.national_ingestion_storage_guard
       set paused=true,
           pause_reason=pause_reason_text,
           paused_at=coalesce(paused_at,now()),
           updated_at=now()
     where singleton=true;
  elsif g.resume_authorized and g.paused and not hard_stop then
    update public.national_ingestion_storage_guard
       set paused=false,
           pause_reason=null,
           paused_at=null,
           updated_at=now()
     where singleton=true;
  end if;

  select * into g
  from public.national_ingestion_storage_guard
  where singleton=true;

  return jsonb_build_object(
    'quota_basis','free_plan_database_size_plus_disk_observed_guard',
    'allocation_bytes',g.allocation_bytes,
    'pause_fraction',g.pause_fraction,
    'hard_stop_fraction',g.hard_stop_fraction,
    'disk_pause_fraction',disk_pause_fraction,
    'disk_hard_stop_fraction',disk_hard_stop_fraction,
    'database_bytes',db_bytes,
    'database_fraction',round(database_fraction,4),
    'database_percent',round(database_fraction*100,2),
    'wal_bytes',wal_bytes,
    'disk_observed_bytes',disk_observed_bytes,
    'disk_observed_fraction',round(disk_fraction,4),
    'disk_observed_percent',round(disk_fraction*100,2),
    'observed_bytes',db_bytes,
    'observed_fraction',round(database_fraction,4),
    'observed_percent',round(database_fraction*100,2),
    'paused',g.paused,
    'pause_reason',g.pause_reason,
    'paused_at',g.paused_at,
    'resume_authorized',g.resume_authorized,
    'resume_authorized_at',g.resume_authorized_at,
    'hard_stop',hard_stop,
    'may_ingest',not g.paused and not hard_stop
  );
end;
$function$;

revoke all on function public.national_ingestion_storage_status() from public, anon;
grant execute on function public.national_ingestion_storage_status() to authenticated, service_role;
