create or replace function public.enforce_national_ingestion_storage_guard()
returns trigger
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  s jsonb;
begin
  s:=public.national_ingestion_storage_status();
  if coalesce((s->>'may_ingest')::boolean,false)=false then
    raise exception 'National ingestion paused by storage guard at %%% observed usage',coalesce(s->>'observed_percent','unknown') using errcode='P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists national_ingestion_storage_guard_before_run on public.national_ingestion_runs;
create trigger national_ingestion_storage_guard_before_run
before insert on public.national_ingestion_runs
for each row execute function public.enforce_national_ingestion_storage_guard();

revoke all on function public.enforce_national_ingestion_storage_guard() from public,anon,authenticated;
