drop function if exists public.mobile_location_presentation_v1(uuid[]);

create function public.mobile_location_presentation_v1(p_location_ids uuid[])
returns table(
 location_id uuid,
 consumer_photo_id uuid,
 consumer_photo_storage_path text,
 consumer_photo_caption text,
 consumer_photo_is_featured boolean,
 consumer_photo_created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path=''
as $$
begin
 if cardinality(coalesce(p_location_ids,'{}'::uuid[]))>200 then raise exception 'Too many locations requested'; end if;
 return query
 select l.id,
        ph.id,ph.storage_path,ph.caption,coalesce(ph.is_featured,false),ph.created_at
 from public.locations l
 left join lateral (
   select p.id,p.storage_path,p.caption,p.is_featured,p.created_at
   from public.location_photos p
   where p.location_id=l.id and p.media_type in ('photo','image')
   order by p.is_featured desc,p.sort_order,p.created_at desc,p.id
   limit 1
 ) ph on true
 where l.id=any(coalesce(p_location_ids,'{}'::uuid[])) and l.is_active=true;
end $$;

revoke all on function public.mobile_location_presentation_v1(uuid[]) from public;
grant execute on function public.mobile_location_presentation_v1(uuid[]) to anon,authenticated,service_role;
