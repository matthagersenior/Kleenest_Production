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
    with q as materialized (
      select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,
             l.phone,l.website,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
             null::timestamptz as source_updated_at,l.created_at as first_seen_at,l.updated_at as last_seen_at,l.updated_at
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and (s.last_id is null or l.id > s.last_id)
      order by l.id
      limit greatest(1,least(p_limit,2000))
    )
    select coalesce((select jsonb_agg(to_jsonb(q)) from q),'[]'::jsonb),
           (select id from q order by id desc limit 1)
      into payload,wm_id;
    return jsonb_build_object('mode','backfill','rows',payload,'watermark_id',wm_id,'watermark_updated_at',null);
  else
    with q as materialized (
      select l.id,l.name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,
             l.phone,l.website,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
             null::timestamptz as source_updated_at,l.created_at as first_seen_at,l.updated_at as last_seen_at,l.updated_at
      from public.locations l
      where l.latitude is not null and l.longitude is not null
        and (l.updated_at > s.last_updated_at or (l.updated_at = s.last_updated_at and (s.last_id is null or l.id > s.last_id)))
      order by l.updated_at,l.id
      limit greatest(1,least(p_limit,2000))
    )
    select coalesce((select jsonb_agg(to_jsonb(q)) from q),'[]'::jsonb),
           (select id from q order by updated_at desc,id desc limit 1),
           (select updated_at from q order by updated_at desc,id desc limit 1)
      into payload,wm_id,wm_ts;
    return jsonb_build_object('mode','incremental','rows',payload,'watermark_id',wm_id,'watermark_updated_at',wm_ts);
  end if;
end;
$$;
