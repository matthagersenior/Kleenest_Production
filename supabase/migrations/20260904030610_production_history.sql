insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('discovery-photos','discovery-photos',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create table if not exists public.discovery_photos (
  id uuid primary key default gen_random_uuid(),
  discovery_id uuid not null references public.discovery_contributions(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index if not exists discovery_photos_location_idx on public.discovery_photos(location_id,created_at desc);
alter table public.discovery_photos enable row level security;
drop policy if exists discovery_photos_read on public.discovery_photos;
create policy discovery_photos_read on public.discovery_photos for select using(true);

drop policy if exists discovery_photo_upload on storage.objects;
create policy discovery_photo_upload on storage.objects for insert to authenticated
with check(bucket_id='discovery-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists discovery_photo_read on storage.objects;
create policy discovery_photo_read on storage.objects for select using(bucket_id='discovery-photos');
drop policy if exists discovery_photo_delete on storage.objects;
create policy discovery_photo_delete on storage.objects for delete to authenticated using(bucket_id='discovery-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.attach_discovery_photo(p_discovery_id uuid,p_storage_path text,p_mime_type text default null,p_size_bytes bigint default null,p_width integer default null,p_height integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_discovery public.discovery_contributions%rowtype;v_id uuid;v_xp jsonb;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 select * into v_discovery from public.discovery_contributions where id=p_discovery_id and user_id=v_user;
 if not found then raise exception 'discovery not found'; end if;
 if split_part(p_storage_path,'/',1)<>v_user::text then raise exception 'invalid storage path'; end if;
 insert into public.discovery_photos(discovery_id,location_id,user_id,storage_path,mime_type,size_bytes,width,height)
 values(p_discovery_id,v_discovery.location_id,v_user,p_storage_path,p_mime_type,p_size_bytes,p_width,p_height)
 returning id into v_id;
 v_xp:=public.record_progression_event_v2('add_photo',jsonb_build_object('location_id',v_discovery.location_id,'source_id',v_id,'evidence_tier',v_discovery.evidence_tier),'discovery-photo:'||v_id::text);
 update public.discovery_contributions set discovery_state=case when discovery_state='candidate' then 'documented' else discovery_state end,payload=payload||jsonb_build_object('has_photo',true),updated_at=now() where id=p_discovery_id;
 return jsonb_build_object('photo_id',v_id,'location_id',v_discovery.location_id,'xp',v_xp);
end $$;
grant execute on function public.attach_discovery_photo(uuid,text,text,bigint,integer,integer) to authenticated;

create or replace function public.discovery_photos_for_location(p_location_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'storage_path',p.storage_path,'mime_type',p.mime_type,'width',p.width,'height',p.height,'created_at',p.created_at) order by p.created_at desc),'[]'::jsonb)
 from public.discovery_photos p where p.location_id=p_location_id
$$;
grant execute on function public.discovery_photos_for_location(uuid) to anon,authenticated;
