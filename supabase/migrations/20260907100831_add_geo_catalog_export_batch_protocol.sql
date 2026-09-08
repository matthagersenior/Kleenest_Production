alter table public.geo_catalog_export_state add column if not exists backfill_complete boolean not null default false;

create or replace function public.geo_catalog_export_batch(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.geo_catalog_export_state%rowtype;
  payload jsonb;
  wm_id uuid;
  wm_ts timestamptz;
begin
  select * into s from public.geo_catalog_export_state where singleton=true;
  if not s.backfill_complete then
    with q as (
      select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,
             l.phone,l.website,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
             null::timestamptz as source_updated_at,l.created_at as first_seen_at,l.updated_at as last_seen_at,l.updated_at
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and (s.last_id is null or l.id > s.last_id)
      order by l.id
      limit greatest(1,least(p_limit,2000))
    )
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb), max(id) into payload,wm_id from q;
    return jsonb_build_object('mode','backfill','rows',payload,'watermark_id',wm_id,'watermark_updated_at',null);
  else
    with q as (
      select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,
             l.phone,l.website,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
             null::timestamptz as source_updated_at,l.created_at as first_seen_at,l.updated_at as last_seen_at,l.updated_at
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and (l.updated_at > s.last_updated_at or (l.updated_at = s.last_updated_at and (s.last_id is null or l.id > s.last_id)))
      order by l.updated_at,l.id
      limit greatest(1,least(p_limit,2000))
    )
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb), max(id) filter (where updated_at=(select max(updated_at) from q)), max(updated_at)
      into payload,wm_id,wm_ts from q;
    return jsonb_build_object('mode','incremental','rows',payload,'watermark_id',wm_id,'watermark_updated_at',wm_ts);
  end if;
end;
$$;

create or replace function public.geo_catalog_export_ack(p_mode text,p_watermark_id uuid,p_watermark_updated_at timestamptz,p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_mode='backfill' then
    if p_rows=0 then
      update public.geo_catalog_export_state set backfill_complete=true,last_id=null,last_updated_at=now(),last_success_at=now(),last_error=null,updated_at=now() where singleton=true;
    else
      update public.geo_catalog_export_state set last_id=p_watermark_id,rows_exported=rows_exported+p_rows,last_success_at=now(),last_error=null,updated_at=now() where singleton=true;
    end if;
  else
    if p_rows>0 then
      update public.geo_catalog_export_state set last_id=p_watermark_id,last_updated_at=p_watermark_updated_at,rows_exported=rows_exported+p_rows,last_success_at=now(),last_error=null,updated_at=now() where singleton=true;
    else
      update public.geo_catalog_export_state set last_success_at=now(),last_error=null,updated_at=now() where singleton=true;
    end if;
  end if;
end;
$$;
revoke all on function public.geo_catalog_export_batch(integer) from public, anon, authenticated;
revoke all on function public.geo_catalog_export_ack(text,uuid,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.geo_catalog_export_batch(integer) to service_role;
grant execute on function public.geo_catalog_export_ack(text,uuid,timestamptz,integer) to service_role;
