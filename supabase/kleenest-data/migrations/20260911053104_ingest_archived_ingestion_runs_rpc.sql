create or replace function public.ingest_archived_ingestion_runs(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_count integer:=0;
begin
  if current_user not in ('service_role','postgres') then raise exception 'service_role required'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'p_rows must be array <=1000'; end if;
  insert into archive.national_ingestion_runs(id,market_id,source_key,status,requests_used,bytes_downloaded,records_seen,records_imported,records_updated,detail,error,started_at,finished_at,archived_at,source_project_ref)
  select (x->>'id')::uuid,
         nullif(x->>'market_id','')::uuid,
         x->>'source_key',
         x->>'status',
         coalesce((x->>'requests_used')::int,0),
         coalesce((x->>'bytes_downloaded')::bigint,0),
         coalesce((x->>'records_seen')::int,0),
         coalesce((x->>'records_imported')::int,0),
         coalesce((x->>'records_updated')::int,0),
         coalesce(x->'detail','{}'::jsonb),
         nullif(x->>'error',''),
         nullif(x->>'started_at','')::timestamptz,
         nullif(x->>'finished_at','')::timestamptz,
         now(),
         'ssgesjzdvdsqacdtasje'
  from jsonb_array_elements(p_rows) x
  on conflict(id) do update set
    market_id=excluded.market_id,source_key=excluded.source_key,status=excluded.status,requests_used=excluded.requests_used,
    bytes_downloaded=excluded.bytes_downloaded,records_seen=excluded.records_seen,records_imported=excluded.records_imported,
    records_updated=excluded.records_updated,detail=excluded.detail,error=excluded.error,started_at=excluded.started_at,
    finished_at=excluded.finished_at,archived_at=now();
  get diagnostics v_count=row_count;
  return v_count;
end
$function$;
