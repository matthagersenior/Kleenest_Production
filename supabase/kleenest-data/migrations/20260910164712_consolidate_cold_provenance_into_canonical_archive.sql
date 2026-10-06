create or replace function public.ingest_cold_external_location_records(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_result jsonb; v_count integer;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then
    raise exception 'service_role required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'batch too large'; end if;
  v_result := public.archive_ingest_batch('external_location_records', p_rows);
  v_count := coalesce((v_result->>'rows_upserted')::integer,0);
  return v_count;
end $function$;

drop table public.cold_external_location_records;
