create or replace function public.business_update_media(p_business_id uuid,p_media_id uuid,p_storage_path text,p_caption text,p_media_type text,p_sort_order integer)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$ begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
 if (storage.foldername(p_storage_path))[1]<>auth.uid()::text then raise exception 'Storage path ownership mismatch'; end if;
 if p_media_type is not null and p_media_type not in ('photo','image','video') then raise exception 'Unsupported media type'; end if;
 update public.location_photos p set storage_path=p_storage_path,caption=p_caption,media_type=coalesce(nullif(trim(p_media_type),''),media_type),sort_order=p_sort_order from public.locations l where p.id=p_media_id and l.id=p.location_id and l.business_id=p_business_id;
 if not found then raise exception 'Media not found'; end if; return p_media_id; end $$;

create or replace function public.business_delete_media(p_business_id uuid,p_media_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth,extensions,pg_temp
as $$ begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 delete from public.location_photos p using public.locations l where p.id=p_media_id and l.id=p.location_id and l.business_id=p_business_id;
 if not found then raise exception 'Media not found'; end if; return true; end $$;
