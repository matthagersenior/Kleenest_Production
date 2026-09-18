alter table public.location_bathroom_verifications add column if not exists check_in_id uuid references public.check_ins(id) on delete set null;
alter table public.location_photos add column if not exists check_in_id uuid references public.check_ins(id) on delete set null;
create index if not exists idx_bathroom_verifications_check_in on public.location_bathroom_verifications(check_in_id) where check_in_id is not null;
create index if not exists idx_location_photos_check_in on public.location_photos(check_in_id) where check_in_id is not null;

create or replace function public.submit_location_verification(
  p_location_id uuid,
  p_is_open boolean,
  p_has_bathroom boolean default true,
  p_note text default null,
  p_check_in_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path to public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_verification_id uuid;
  v_checkin record;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_location_id is null or not exists(select 1 from public.locations where id=p_location_id) then raise exception 'Location not found'; end if;

  if p_check_in_id is not null then
    select id,user_id,location_id,checked_in_at into v_checkin
    from public.check_ins where id=p_check_in_id;
    if not found then raise exception 'Check-in not found'; end if;
    if v_checkin.user_id <> v_user then raise exception 'Check-in belongs to another user'; end if;
    if v_checkin.location_id <> p_location_id then raise exception 'Check-in location does not match verification location'; end if;
    if v_checkin.checked_in_at < now() - interval '24 hours' then raise exception 'Check-in is too old for this evidence session'; end if;
  end if;

  v_status := case when p_is_open then 'open' else 'closed' end;

  insert into public.restroom_observations(location_id,user_id,check_in_id,observation_type,note,source,confidence)
  values(p_location_id,v_user,p_check_in_id,v_status,p_note,'community_verification',1.0);

  insert into public.location_bathroom_verifications(location_id,user_id,check_in_id,has_public_bathroom,verification_method)
  values(p_location_id,v_user,p_check_in_id,p_has_bathroom,'community_verification')
  returning id into v_verification_id;

  return jsonb_build_object('location_id',p_location_id,'open',p_is_open,'has_bathroom',p_has_bathroom,'verification_id',v_verification_id,'check_in_id',p_check_in_id,'evidence_session_anchored',p_check_in_id is not null,'projection_authority','process_bathroom_verification','reward_authority','gamification_activity_trigger');
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
) returns public.location_photos
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
declare uid uuid:=auth.uid(); r public.location_photos; v_prefix text; v_checkin record;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_location_id is null or not exists(select 1 from public.locations where id=p_location_id) then raise exception 'Location not found'; end if;
 if nullif(trim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
 if p_check_in_id is not null then
   select id,user_id,location_id,checked_in_at into v_checkin from public.check_ins where id=p_check_in_id;
   if not found or v_checkin.user_id<>uid then raise exception 'Invalid check-in'; end if;
   if v_checkin.location_id<>p_location_id then raise exception 'Check-in location does not match photo location'; end if;
   if v_checkin.checked_in_at < now()-interval '24 hours' then raise exception 'Check-in is too old for this evidence session'; end if;
 end if;
 v_prefix=(storage.foldername(p_storage_path))[1]; if v_prefix is null or v_prefix<>uid::text then raise exception 'Storage path must belong to authenticated user'; end if;
 if p_size_bytes is not null and (p_size_bytes<0 or p_size_bytes>52428800) then raise exception 'Invalid media size'; end if;
 if p_width is not null and (p_width<1 or p_width>20000) then raise exception 'Invalid width'; end if;
 if p_height is not null and (p_height<1 or p_height>20000) then raise exception 'Invalid height'; end if;
 if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic') then raise exception 'Unsupported image type'; end if;
 insert into public.location_photos(location_id,user_id,check_in_id,storage_path,caption,media_type,mime_type,size_bytes,width,height,created_at)
 values(p_location_id,uid,p_check_in_id,p_storage_path,p_caption,p_media_type,p_mime_type,p_size_bytes,p_width,p_height,now()) returning * into r;
 perform public.record_progression_metric_event('verification','location_photo',r.id,1,10,jsonb_build_object('location_id',p_location_id,'check_in_id',p_check_in_id)); return r;
end;
$$;

update public.capability_function_classifications set rationale='Consumer evidence submission with optional check-in evidence-session anchoring and ownership validation.' where function_signature='submit_location_verification(uuid,boolean,boolean,text)';
update public.capability_function_classifications set rationale='Consumer photo evidence submission with optional check-in evidence-session anchoring and ownership validation.' where function_signature='submit_location_photo_record(uuid,text,text,text,text,bigint,integer,integer)';
