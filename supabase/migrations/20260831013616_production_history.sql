create unique index if not exists review_photos_review_storage_unique on public.review_photos(review_id, storage_path);

create or replace function public.attach_review_photo(
  p_review_id uuid,
  p_storage_path text,
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_sort_order integer default 0
)
returns public.review_photos
language plpgsql
security definer
set search_path = public, auth, storage, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_photo public.review_photos;
  v_path text := trim(coalesce(p_storage_path,''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_review_id is null then raise exception 'REVIEW_REQUIRED'; end if;
  if v_path = '' then raise exception 'STORAGE_PATH_REQUIRED'; end if;
  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 12582912) then raise exception 'PHOTO_SIZE_OUT_OF_RANGE'; end if;
  if p_width is not null and p_width <= 0 then raise exception 'PHOTO_WIDTH_INVALID'; end if;
  if p_height is not null and p_height <= 0 then raise exception 'PHOTO_HEIGHT_INVALID'; end if;

  if not exists(
    select 1 from public.reviews r
    where r.id=p_review_id and r.user_id=v_uid and r.status='published'
  ) then raise exception 'REVIEW_NOT_FOUND_OR_NOT_OWNED'; end if;

  if split_part(v_path,'/',1) <> v_uid::text then raise exception 'PHOTO_PATH_NOT_OWNED'; end if;
  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='review-photos' and o.name=v_path and o.owner_id=v_uid::text
  ) then raise exception 'REVIEW_PHOTO_OBJECT_NOT_FOUND'; end if;

  insert into public.review_photos(review_id,storage_path,mime_type,size_bytes,width,height,sort_order)
  values(p_review_id,v_path,nullif(trim(coalesce(p_mime_type,'')),''),p_size_bytes,p_width,p_height,greatest(coalesce(p_sort_order,0),0))
  on conflict (review_id,storage_path) do update
    set mime_type=excluded.mime_type,
        size_bytes=excluded.size_bytes,
        width=excluded.width,
        height=excluded.height,
        sort_order=excluded.sort_order
  returning * into v_photo;

  return v_photo;
end;
$$;

revoke all on function public.attach_review_photo(uuid,text,text,bigint,integer,integer,integer) from public, anon;
grant execute on function public.attach_review_photo(uuid,text,text,bigint,integer,integer,integer) to authenticated;
