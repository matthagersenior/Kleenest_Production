create or replace function public.business_manages_location(p_business_id uuid,p_location_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select public.business_can_manage(p_business_id)
     and exists(
       select 1
       from public.locations l
       where l.id=p_location_id
         and (
           l.business_id=p_business_id
           or l.claimed_business_id=p_business_id
           or exists(
             select 1 from public.location_claims c
             where c.location_id=l.id and c.business_id=p_business_id and c.status='approved'
           )
         )
     )
$$;

revoke all on function public.business_manages_location(uuid,uuid) from public,anon;
grant execute on function public.business_manages_location(uuid,uuid) to authenticated,service_role;

create or replace function public.business_create_media(
 p_business_id uuid,p_location_id uuid,p_storage_path text,p_caption text,
 p_media_type text default 'photo',p_mime_type text default null,p_size_bytes bigint default null,
 p_width integer default null,p_height integer default null,p_sort_order integer default 0
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_id uuid; v_uid uuid:=auth.uid(); v_prefix text; v_featured boolean;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not public.business_manages_location(p_business_id,p_location_id) then raise exception 'Business management access required for location'; end if;
 if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
 v_prefix=(storage.foldername(p_storage_path))[1];
 if v_prefix is null or v_prefix<>v_uid::text then raise exception 'Storage path must belong to authenticated user'; end if;
 if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>12582912) then raise exception 'Invalid media size'; end if;
 if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported image type'; end if;
 if coalesce(nullif(trim(p_media_type),''),'photo') not in ('photo','image') then raise exception 'Unsupported media type'; end if;
 select not exists(select 1 from public.location_photos where location_id=p_location_id and is_featured) into v_featured;
 insert into public.location_photos(location_id,user_id,storage_path,caption,media_type,mime_type,size_bytes,width,height,sort_order,is_featured)
 values(p_location_id,v_uid,p_storage_path,nullif(trim(p_caption),''),coalesce(nullif(trim(p_media_type),''),'photo'),p_mime_type,p_size_bytes,p_width,p_height,coalesce(p_sort_order,0),v_featured)
 returning id into v_id;
 return v_id;
end $$;

revoke all on function public.business_create_media(uuid,uuid,text,text,text,text,bigint,integer,integer,integer) from public,anon;
grant execute on function public.business_create_media(uuid,uuid,text,text,text,text,bigint,integer,integer,integer) to authenticated,service_role;

create or replace function public.business_update_media(
 p_business_id uuid,p_media_id uuid,p_storage_path text,p_caption text,p_media_type text,p_sort_order integer
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_location_id uuid; v_existing_path text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select p.location_id,p.storage_path into v_location_id,v_existing_path from public.location_photos p where p.id=p_media_id;
 if v_location_id is null then raise exception 'Media not found'; end if;
 if not public.business_manages_location(p_business_id,v_location_id) then raise exception 'Business management access required for location'; end if;
 if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
 if p_storage_path<>v_existing_path and (storage.foldername(p_storage_path))[1]<>auth.uid()::text then raise exception 'Storage path ownership mismatch'; end if;
 if p_media_type is not null and p_media_type not in ('photo','image') then raise exception 'Unsupported media type'; end if;
 update public.location_photos
 set storage_path=p_storage_path,
     caption=nullif(trim(p_caption),''),
     media_type=coalesce(nullif(trim(p_media_type),''),media_type),
     sort_order=coalesce(p_sort_order,sort_order)
 where id=p_media_id;
 return p_media_id;
end $$;

revoke all on function public.business_update_media(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.business_update_media(uuid,uuid,text,text,text,integer) to authenticated,service_role;

create or replace function public.business_delete_media(p_business_id uuid,p_media_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_location_id uuid; v_was_featured boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select p.location_id,p.is_featured into v_location_id,v_was_featured from public.location_photos p where p.id=p_media_id;
 if v_location_id is null then raise exception 'Media not found'; end if;
 if not public.business_manages_location(p_business_id,v_location_id) then raise exception 'Business management access required for location'; end if;
 perform 1 from public.locations where id=v_location_id for update;
 delete from public.location_photos where id=p_media_id;
 if v_was_featured then
   update public.location_photos p
   set is_featured=true
   where p.id=(
     select p2.id from public.location_photos p2
     where p2.location_id=v_location_id and p2.media_type in ('photo','image')
     order by p2.sort_order,p2.created_at desc,p2.id
     limit 1
   );
 end if;
 return true;
end $$;

revoke all on function public.business_delete_media(uuid,uuid) from public,anon;
grant execute on function public.business_delete_media(uuid,uuid) to authenticated,service_role;

create or replace function public.business_list_media_v2(p_business_id uuid)
returns table(
 id uuid,location_id uuid,location_name text,storage_path text,caption text,media_type text,mime_type text,
 size_bytes bigint,width integer,height integer,sort_order integer,is_featured boolean,created_at timestamptz
)
language sql stable security definer set search_path=''
as $$
 select p.id,p.location_id,l.name,p.storage_path,p.caption,p.media_type,p.mime_type,p.size_bytes,p.width,p.height,p.sort_order,p.is_featured,p.created_at
 from public.location_photos p
 join public.locations l on l.id=p.location_id
 where public.business_can_manage(p_business_id)
   and (
     l.business_id=p_business_id
     or l.claimed_business_id=p_business_id
     or exists(select 1 from public.location_claims c where c.location_id=l.id and c.business_id=p_business_id and c.status='approved')
   )
 order by p.is_featured desc,p.created_at desc
$$;

revoke all on function public.business_list_media_v2(uuid) from public,anon;
grant execute on function public.business_list_media_v2(uuid) to authenticated,service_role;

create or replace function public.business_set_location_consumer_photo(p_business_id uuid,p_location_id uuid,p_media_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_photo public.location_photos;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.business_manages_location(p_business_id,p_location_id) then raise exception 'Business management access required for location'; end if;
 perform 1 from public.locations where id=p_location_id for update;
 select * into v_photo from public.location_photos where id=p_media_id and location_id=p_location_id and media_type in ('photo','image');
 if v_photo.id is null then raise exception 'Location photo not found'; end if;
 update public.location_photos set is_featured=false where location_id=p_location_id and is_featured and id<>p_media_id;
 update public.location_photos set is_featured=true where id=p_media_id;
 return jsonb_build_object(
   'location_id',p_location_id,'media_id',p_media_id,'storage_path',v_photo.storage_path,
   'caption',v_photo.caption,'is_featured',true,'updated_at',now()
 );
end $$;

revoke all on function public.business_set_location_consumer_photo(uuid,uuid,uuid) from public,anon;
grant execute on function public.business_set_location_consumer_photo(uuid,uuid,uuid) to authenticated,service_role;

create or replace function public.mobile_location_presentation_v1(p_location_ids uuid[])
returns table(
 location_id uuid,business_id uuid,business_name text,business_logo_url text,
 consumer_photo_id uuid,consumer_photo_storage_path text,consumer_photo_caption text,
 consumer_photo_is_featured boolean,consumer_photo_created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
begin
 if cardinality(coalesce(p_location_ids,'{}'::uuid[]))>200 then raise exception 'Too many locations requested'; end if;
 return query
 select l.id,coalesce(l.claimed_business_id,l.business_id),b.name,b.logo_url,
        ph.id,ph.storage_path,ph.caption,coalesce(ph.is_featured,false),ph.created_at
 from public.locations l
 left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
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
