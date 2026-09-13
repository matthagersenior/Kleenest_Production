
alter table public.location_photos
  add column if not exists origin text not null default 'community',
  add column if not exists business_id uuid references public.businesses(id) on delete set null,
  add column if not exists moderation_status text not null default 'visible',
  add column if not exists moderation_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.location_photos'::regclass
      and conname='location_photos_origin_check'
  ) then
    alter table public.location_photos
      add constraint location_photos_origin_check
      check (origin in ('community','business'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.location_photos'::regclass
      and conname='location_photos_moderation_status_check'
  ) then
    alter table public.location_photos
      add constraint location_photos_moderation_status_check
      check (moderation_status in ('visible','hidden','pending'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.location_photos'::regclass
      and conname='location_photos_origin_business_check'
  ) then
    alter table public.location_photos
      add constraint location_photos_origin_business_check
      check (
        (origin='community' and business_id is null)
        or (origin='business' and business_id is not null)
      );
  end if;
end $$;

create index if not exists location_photos_business_id_idx
  on public.location_photos(business_id)
  where business_id is not null;

create index if not exists location_photos_visible_location_idx
  on public.location_photos(location_id,is_featured desc,sort_order,created_at desc)
  where moderation_status='visible';

create or replace function public.business_create_media(
  p_business_id uuid,
  p_location_id uuid,
  p_storage_path text,
  p_caption text,
  p_media_type text default 'photo',
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid:=auth.uid();
  v_prefix text;
  v_featured boolean;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.business_manages_location(p_business_id,p_location_id) then
    raise exception 'Business management access required for location';
  end if;
  if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
  v_prefix=(storage.foldername(p_storage_path))[1];
  if v_prefix is null or v_prefix<>v_uid::text then
    raise exception 'Storage path must belong to authenticated user';
  end if;
  if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>12582912) then
    raise exception 'Invalid media size';
  end if;
  if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Unsupported image type';
  end if;
  if coalesce(nullif(trim(p_media_type),''),'photo') not in ('photo','image') then
    raise exception 'Unsupported media type';
  end if;

  select not exists(
    select 1
    from public.location_photos
    where location_id=p_location_id
      and origin='business'
      and business_id=p_business_id
      and moderation_status='visible'
      and is_featured
  ) into v_featured;

  insert into public.location_photos(
    location_id,user_id,business_id,origin,storage_path,caption,media_type,mime_type,
    size_bytes,width,height,sort_order,is_featured,moderation_status
  )
  values(
    p_location_id,v_uid,p_business_id,'business',p_storage_path,
    nullif(trim(p_caption),''),coalesce(nullif(trim(p_media_type),''),'photo'),
    p_mime_type,p_size_bytes,p_width,p_height,coalesce(p_sort_order,0),v_featured,'visible'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.submit_location_photo_record(
  p_location_id uuid,
  p_storage_path text,
  p_caption text default null,
  p_media_type text default 'image',
  p_mime_type text default null,
  p_size_bytes bigint default null,
  p_width integer default null,
  p_height integer default null,
  p_check_in_id uuid default null
)
returns public.location_photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid:=auth.uid();
  r public.location_photos;
  v_prefix text;
  v_checkin record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_location_id is null or not exists(select 1 from public.locations where id=p_location_id and is_active=true) then
    raise exception 'Location not found';
  end if;
  if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;

  if p_check_in_id is not null then
    select id,user_id,location_id,checked_in_at
      into v_checkin
    from public.check_ins
    where id=p_check_in_id;
    if not found or v_checkin.user_id<>uid then raise exception 'Invalid check-in'; end if;
    if v_checkin.location_id<>p_location_id then raise exception 'Check-in location does not match photo location'; end if;
    if v_checkin.checked_in_at < now()-interval '24 hours' then
      raise exception 'Check-in is too old for this evidence session';
    end if;
  end if;

  v_prefix=(storage.foldername(p_storage_path))[1];
  if v_prefix is null or v_prefix<>uid::text then
    raise exception 'Storage path must belong to authenticated user';
  end if;
  if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>52428800) then raise exception 'Invalid media size'; end if;
  if p_width is not null and (p_width<1 or p_width>20000) then raise exception 'Invalid width'; end if;
  if p_height is not null and (p_height<1 or p_height>20000) then raise exception 'Invalid height'; end if;
  if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic') then
    raise exception 'Unsupported image type';
  end if;

  insert into public.location_photos(
    location_id,user_id,business_id,origin,check_in_id,storage_path,caption,media_type,mime_type,
    size_bytes,width,height,is_featured,moderation_status,created_at
  )
  values(
    p_location_id,uid,null,'community',p_check_in_id,p_storage_path,p_caption,p_media_type,p_mime_type,
    p_size_bytes,p_width,p_height,false,'visible',now()
  )
  returning * into r;

  perform public.record_progression_metric_event(
    'verification','location_photo',r.id,1,10,
    jsonb_build_object('location_id',p_location_id,'check_in_id',p_check_in_id)
  );
  return r;
end;
$$;

create or replace function public.set_featured_location_photo(p_location_id uuid,p_photo_id uuid)
returns public.location_photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_photo public.location_photos;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select coalesce(l.claimed_business_id,l.business_id)
    into v_business_id
  from public.locations l
  where l.id=p_location_id and l.is_active=true;

  if v_business_id is null then raise exception 'Claimed business location required'; end if;
  if not public.business_can_manage(v_business_id) then raise exception 'Not authorized to manage this location'; end if;
  if not public.business_advanced_allowed(v_business_id) then
    raise exception 'Featured business photos require Business Growth, Fleet, or Enterprise';
  end if;

  select *
    into v_photo
  from public.location_photos
  where id=p_photo_id
    and location_id=p_location_id
    and origin='business'
    and business_id=v_business_id
    and moderation_status='visible';

  if v_photo.id is null then
    raise exception 'Only visible business-owned media can be featured';
  end if;

  update public.location_photos
     set is_featured=false
   where location_id=p_location_id
     and origin='business'
     and business_id=v_business_id;

  update public.location_photos
     set is_featured=true
   where id=p_photo_id
  returning * into v_photo;

  return v_photo;
end;
$$;

revoke all on function public.business_create_media(uuid,uuid,text,text,text,text,bigint,integer,integer,integer) from public, anon;
grant execute on function public.business_create_media(uuid,uuid,text,text,text,text,bigint,integer,integer,integer) to authenticated, service_role;

revoke all on function public.submit_location_photo_record(uuid,text,text,text,text,bigint,integer,integer,uuid) from public, anon;
grant execute on function public.submit_location_photo_record(uuid,text,text,text,text,bigint,integer,integer,uuid) to authenticated, service_role;

revoke all on function public.set_featured_location_photo(uuid,uuid) from public, anon;
grant execute on function public.set_featured_location_photo(uuid,uuid) to authenticated, service_role;
