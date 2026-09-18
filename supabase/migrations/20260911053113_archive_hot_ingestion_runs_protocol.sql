create or replace function public.cold_ingestion_run_archive_batch(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare payload jsonb;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
  with q as materialized (
    select r.* from public.national_ingestion_runs r
    where r.started_at < now()-interval '48 hours'
    order by r.started_at,r.id
    limit greatest(1,least(p_limit,1000))
  )
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into payload from q;
  return jsonb_build_object('rows',payload,'count',jsonb_array_length(payload));
end
$function$;

create or replace function public.cold_ingestion_run_archive_ack(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare v_count integer;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
  delete from public.national_ingestion_runs
  where id=any(p_ids) and started_at < now()-interval '48 hours';
  get diagnostics v_count=row_count;
  return v_count;
end
$function$;
