create or replace function public.cold_external_location_archive_batch(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare payload jsonb;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
  with q as materialized (
    select e.*
    from public.external_location_records e
    where e.last_seen_at < now()-interval '7 days'
      and not exists (select 1 from public.external_observations o where o.external_record_id=e.id)
      and not exists (select 1 from public.external_location_evidence x where x.external_record_id=e.id)
    order by e.last_seen_at,e.id
    limit greatest(1,least(p_limit,1000))
  )
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into payload from q;
  return jsonb_build_object('rows',payload,'count',jsonb_array_length(payload));
end $$;
revoke all on function public.cold_external_location_archive_batch(integer) from public,anon,authenticated;
grant execute on function public.cold_external_location_archive_batch(integer) to service_role;

create or replace function public.cold_external_location_archive_ack(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then raise exception 'service_role required'; end if;
  delete from public.external_location_records e
  where e.id=any(p_ids)
    and e.last_seen_at < now()-interval '7 days'
    and not exists (select 1 from public.external_observations o where o.external_record_id=e.id)
    and not exists (select 1 from public.external_location_evidence x where x.external_record_id=e.id);
  get diagnostics v_count=row_count;
  return v_count;
end $$;
revoke all on function public.cold_external_location_archive_ack(uuid[]) from public,anon,authenticated;
grant execute on function public.cold_external_location_archive_ack(uuid[]) to service_role;
