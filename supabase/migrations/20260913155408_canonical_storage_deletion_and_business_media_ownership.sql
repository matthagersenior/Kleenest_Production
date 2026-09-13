
alter table public.review_photo_storage_moderation_jobs
  rename to storage_object_deletion_jobs;

alter table public.storage_object_deletion_jobs
  add column if not exists location_photo_id uuid references public.location_photos(id) on delete set null;

alter table public.storage_object_deletion_jobs
  drop constraint if exists review_photo_storage_moderation_jobs_bucket_id_check,
  drop constraint if exists review_photo_storage_moderation_jobs_reason_check;

alter table public.storage_object_deletion_jobs
  add constraint storage_object_deletion_jobs_bucket_check
    check (bucket_id in ('review-photos','location-photos')),
  add constraint storage_object_deletion_jobs_reason_check
    check (reason in ('privacy','explicit','business_delete'));

drop index if exists public.review_photo_storage_moderation_jobs_photo_action_uidx;
create unique index if not exists storage_object_deletion_jobs_object_action_uidx
  on public.storage_object_deletion_jobs(bucket_id,object_path,action);

alter index if exists public.review_photo_storage_moderation_jobs_queue_idx
  rename to storage_object_deletion_jobs_queue_idx;
alter index if exists public.review_photo_storage_moderation_jobs_report_idx
  rename to storage_object_deletion_jobs_report_idx;
alter index if exists public.review_photo_storage_moderation_jobs_requested_by_idx
  rename to storage_object_deletion_jobs_requested_by_idx;

create index if not exists storage_object_deletion_jobs_review_photo_idx
  on public.storage_object_deletion_jobs(review_photo_id)
  where review_photo_id is not null;

create index if not exists storage_object_deletion_jobs_location_photo_idx
  on public.storage_object_deletion_jobs(location_photo_id)
  where location_photo_id is not null;

revoke all on public.storage_object_deletion_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.storage_object_deletion_jobs to service_role;

create or replace function public.claim_storage_object_deletion_jobs(p_limit integer default 20)
returns table(id uuid,bucket_id text,object_path text,attempts integer)
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'service_role required' using errcode='42501';
  end if;

  return query
  with picked as (
    select j.id
    from public.storage_object_deletion_jobs j
    where j.status in ('queued','failed')
      and j.attempts < 5
    order by j.created_at,j.id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.storage_object_deletion_jobs j
       set status='processing',
           attempts=j.attempts+1,
           last_error=null,
           updated_at=now()
      from picked
     where j.id=picked.id
    returning j.id,j.bucket_id,j.object_path,j.attempts
  )
  select c.id,c.bucket_id,c.object_path,c.attempts from claimed c;
end;
$$;

revoke all on function public.claim_storage_object_deletion_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_storage_object_deletion_jobs(integer) to service_role;

create or replace function public.claim_review_photo_storage_moderation_jobs(p_limit integer default 20)
returns table(id uuid,bucket_id text,object_path text,attempts integer)
language sql
security definer
set search_path=''
as $$
  select * from public.claim_storage_object_deletion_jobs(p_limit);
$$;
revoke all on function public.claim_review_photo_storage_moderation_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_review_photo_storage_moderation_jobs(integer) to service_role;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='admin_resolve_review_photo_report'
    and pg_get_function_identity_arguments(p.oid)='p_report_id uuid, p_status text, p_resolution text, p_notes text'
  limit 1;

  if v_def is not null then
    v_def := replace(v_def,'public.review_photo_storage_moderation_jobs','public.storage_object_deletion_jobs');
    v_def := replace(
      v_def,
      'on conflict (review_photo_id,action,object_path) where review_photo_id is not null',
      'on conflict (bucket_id,object_path,action)'
    );
    execute v_def;
  end if;
end $$;

create or replace function public.business_delete_media(p_business_id uuid,p_media_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_location_id uuid;
  v_storage_path text;
  v_was_featured boolean;
  v_job_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select p.location_id,p.storage_path,p.is_featured
    into v_location_id,v_storage_path,v_was_featured
  from public.location_photos p
  where p.id=p_media_id
    and p.origin='business'
    and p.business_id=p_business_id
  for update;

  if v_location_id is null then
    raise exception 'Business-owned media not found';
  end if;
  if not public.business_manages_location(p_business_id,v_location_id) then
    raise exception 'Business management access required for location';
  end if;

  insert into public.storage_object_deletion_jobs(
    location_photo_id,bucket_id,object_path,action,reason,status,requested_by
  )
  values(
    p_media_id,'location-photos',v_storage_path,'delete','business_delete','queued',auth.uid()
  )
  on conflict(bucket_id,object_path,action)
  do update set
    location_photo_id=excluded.location_photo_id,
    requested_by=excluded.requested_by,
    reason='business_delete',
    status=case when public.storage_object_deletion_jobs.status='completed' then 'completed' else 'queued' end,
    last_error=null,
    updated_at=now()
  returning id into v_job_id;

  delete from public.location_photos
  where id=p_media_id
    and origin='business'
    and business_id=p_business_id;

  if v_was_featured then
    update public.location_photos p
       set is_featured=true
     where p.id=(
       select p2.id
       from public.location_photos p2
       where p2.location_id=v_location_id
         and p2.origin='business'
         and p2.business_id=p_business_id
         and p2.moderation_status='visible'
         and p2.media_type in ('photo','image')
       order by p2.sort_order,p2.created_at desc,p2.id
       limit 1
     );
  end if;

  if exists(
    select 1 from public.storage_object_deletion_jobs j
    where j.id=v_job_id and j.status<>'completed'
  ) then
    perform net.http_post(
      url:='https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/storage-object-deletion',
      body:=jsonb_build_object('source','business_delete_media'),
      headers:='{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds:=5000
    );
  end if;

  return true;
end;
$$;

create or replace function public.business_update_media(
  p_business_id uuid,p_media_id uuid,p_storage_path text,p_caption text,p_media_type text,p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_location_id uuid;
  v_existing_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select p.location_id,p.storage_path
    into v_location_id,v_existing_path
  from public.location_photos p
  where p.id=p_media_id
    and p.origin='business'
    and p.business_id=p_business_id;

  if v_location_id is null then raise exception 'Business-owned media not found'; end if;
  if not public.business_manages_location(p_business_id,v_location_id) then
    raise exception 'Business management access required for location';
  end if;
  if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
  if p_storage_path<>v_existing_path and (storage.foldername(p_storage_path))[1]<>auth.uid()::text then
    raise exception 'Storage path ownership mismatch';
  end if;
  if p_media_type is not null and p_media_type not in ('photo','image') then
    raise exception 'Unsupported media type';
  end if;

  update public.location_photos
     set storage_path=p_storage_path,
         caption=nullif(trim(p_caption),''),
         media_type=coalesce(nullif(trim(p_media_type),''),media_type),
         sort_order=coalesce(p_sort_order,sort_order)
   where id=p_media_id
     and origin='business'
     and business_id=p_business_id;

  return p_media_id;
end;
$$;

create or replace function public.business_list_media(p_business_id uuid)
returns table(
 id uuid,location_id uuid,location_name text,storage_path text,caption text,media_type text,mime_type text,
 size_bytes bigint,width integer,height integer,sort_order integer,created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
 select p.id,p.location_id,l.name,p.storage_path,p.caption,p.media_type,p.mime_type,
        p.size_bytes,p.width,p.height,p.sort_order,p.created_at
 from public.location_photos p
 join public.locations l on l.id=p.location_id
 where p.origin='business'
   and p.business_id=p_business_id
   and p.moderation_status='visible'
   and public.business_can_manage(p_business_id)
 order by p.created_at desc;
$$;

create or replace function public.business_list_media_v2(p_business_id uuid)
returns table(
 id uuid,location_id uuid,location_name text,storage_path text,caption text,media_type text,mime_type text,
 size_bytes bigint,width integer,height integer,sort_order integer,is_featured boolean,created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
 select p.id,p.location_id,l.name,p.storage_path,p.caption,p.media_type,p.mime_type,
        p.size_bytes,p.width,p.height,p.sort_order,p.is_featured,p.created_at
 from public.location_photos p
 join public.locations l on l.id=p.location_id
 where p.origin='business'
   and p.business_id=p_business_id
   and p.moderation_status='visible'
   and public.business_can_manage(p_business_id)
 order by p.is_featured desc,p.created_at desc;
$$;

revoke all on function public.business_delete_media(uuid,uuid) from public,anon;
revoke all on function public.business_update_media(uuid,uuid,text,text,text,integer) from public,anon;
revoke all on function public.business_list_media(uuid) from public,anon;
revoke all on function public.business_list_media_v2(uuid) from public,anon;
grant execute on function public.business_delete_media(uuid,uuid) to authenticated,service_role;
grant execute on function public.business_update_media(uuid,uuid,text,text,text,integer) to authenticated,service_role;
grant execute on function public.business_list_media(uuid) to authenticated,service_role;
grant execute on function public.business_list_media_v2(uuid) to authenticated,service_role;
