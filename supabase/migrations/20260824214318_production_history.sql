create or replace function public.submit_location_photo_record(p_location_id uuid,p_storage_path text,p_caption text default null,p_media_type text default 'image',p_mime_type text default null,p_size_bytes bigint default null,p_width integer default null,p_height integer default null)
returns public.location_photos language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$ declare uid uuid:=auth.uid(); r public.location_photos; v_prefix text; begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_location_id is null or not exists(select 1 from public.locations where id=p_location_id) then raise exception 'Location not found'; end if;
 if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
 v_prefix=(storage.foldername(p_storage_path))[1]; if v_prefix is null or v_prefix<>uid::text then raise exception 'Storage path must belong to authenticated user'; end if;
 if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>52428800) then raise exception 'Invalid media size'; end if;
 if p_width is not null and (p_width<1 or p_width>20000) then raise exception 'Invalid width'; end if;
 if p_height is not null and (p_height<1 or p_height>20000) then raise exception 'Invalid height'; end if;
 if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic') then raise exception 'Unsupported image type'; end if;
 insert into public.location_photos(location_id,user_id,storage_path,caption,media_type,mime_type,size_bytes,width,height,created_at) values(p_location_id,uid,p_storage_path,p_caption,p_media_type,p_mime_type,p_size_bytes,p_width,p_height,now()) returning * into r;
 perform public.record_progression_metric_event('verification','location_photo',r.id,1,10,jsonb_build_object('location_id',p_location_id)); return r;
end $$;

create or replace function public.business_create_media(p_business_id uuid,p_location_id uuid,p_storage_path text,p_caption text,p_media_type text default 'photo',p_mime_type text default null,p_size_bytes bigint default null,p_width integer default null,p_height integer default null,p_sort_order integer default 0)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$ declare v_id uuid; uid uuid:=auth.uid(); v_prefix text; begin
 if uid is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
 if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
 v_prefix=(storage.foldername(p_storage_path))[1]; if v_prefix is null or v_prefix<>uid::text then raise exception 'Storage path must belong to authenticated user'; end if;
 if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>52428800) then raise exception 'Invalid media size'; end if;
 if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic') then raise exception 'Unsupported image type'; end if;
 insert into public.location_photos(location_id,user_id,storage_path,caption,media_type,mime_type,size_bytes,width,height,sort_order) values(p_location_id,uid,p_storage_path,p_caption,coalesce(nullif(trim(p_media_type),''),'photo'),p_mime_type,p_size_bytes,p_width,p_height,p_sort_order) returning id into v_id; return v_id;
end $$;
