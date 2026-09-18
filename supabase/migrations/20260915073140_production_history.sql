-- Let verified review photos added after the visit continue to advance progression.
-- Keep the photo as evidence for the original verified review while preserving upload time separately.

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
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_photo public.review_photos;
  v_path text := trim(coalesce(p_storage_path,''));
  v_location_id uuid;
  v_check_in_id uuid;
  v_progression_eligible boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_review_id is null then raise exception 'REVIEW_REQUIRED'; end if;
  if v_path = '' then raise exception 'STORAGE_PATH_REQUIRED'; end if;
  if p_size_bytes is not null and (p_size_bytes < 0 or p_size_bytes > 12582912) then raise exception 'PHOTO_SIZE_OUT_OF_RANGE'; end if;
  if p_width is not null and p_width <= 0 then raise exception 'PHOTO_WIDTH_INVALID'; end if;
  if p_height is not null and p_height <= 0 then raise exception 'PHOTO_HEIGHT_INVALID'; end if;

  select r.location_id,
         r.check_in_id,
         lower(coalesce(c.metadata->>'progression_eligible','false'))='true'
    into v_location_id,v_check_in_id,v_progression_eligible
  from public.reviews r
  left join public.check_ins c
    on c.id=r.check_in_id
   and c.user_id=v_uid
   and c.location_id=r.location_id
  where r.id=p_review_id
    and r.user_id=v_uid
    and r.status='published';

  if v_location_id is null then raise exception 'REVIEW_NOT_FOUND_OR_NOT_OWNED'; end if;

  if split_part(v_path,'/',1) <> v_uid::text then raise exception 'PHOTO_PATH_NOT_OWNED'; end if;
  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='review-photos' and o.name=v_path and o.owner_id=v_uid::text
  ) then raise exception 'REVIEW_PHOTO_OBJECT_NOT_FOUND'; end if;

  if not exists(select 1 from public.review_photos rp where rp.review_id=p_review_id and rp.storage_path=v_path)
     and (select count(*) from public.review_photos rp where rp.review_id=p_review_id) >= 3 then
    raise exception 'REVIEW_PHOTO_LIMIT_REACHED';
  end if;

  insert into public.review_photos(review_id,storage_path,mime_type,size_bytes,width,height,sort_order)
  values(p_review_id,v_path,nullif(trim(coalesce(p_mime_type,'')),''),p_size_bytes,p_width,p_height,greatest(coalesce(p_sort_order,0),0))
  on conflict (review_id,storage_path) do update
    set mime_type=excluded.mime_type,
        size_bytes=excluded.size_bytes,
        width=excluded.width,
        height=excluded.height,
        sort_order=excluded.sort_order
  returning * into v_photo;

  if v_progression_eligible and v_check_in_id is not null then
    perform public.record_progression_event_v2(
      'add_photo',
      jsonb_build_object(
        'location_id',v_location_id,
        'review_id',p_review_id,
        'check_in_id',v_check_in_id,
        'source_id',v_photo.id,
        'evidence_tier',1,
        'evidence_source','review_photo',
        'uploaded_at',v_photo.created_at
      ),
      'review-photo:'||v_photo.id::text
    );
  end if;

  return v_photo;
end;
$function$;

revoke all on function public.attach_review_photo(uuid,text,text,bigint,integer,integer,integer) from public,anon;
grant execute on function public.attach_review_photo(uuid,text,text,bigint,integer,integer,integer) to authenticated,service_role;

create or replace function public.my_week_in_review(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := least(greatest(coalesce(p_days,7),1),30);
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  with visit_rows as (
    select
      v.id as visit_id,
      v.location_id,
      l.name as location_name,
      v.occurred_at as visited_at,
      v.last_seen_at,
      v.departed_at,
      v.verification_expires_at,
      ci.id as check_in_id,
      ci.checked_in_at,
      ci.verification_method,
      coalesce(ci.metadata->>'progression_eligible','false')='true' as progression_eligible,
      r.id as review_id,
      r.created_at as reviewed_at,
      coalesce((
        select count(*)::integer
        from public.review_photos rp
        where rp.review_id=r.id
          and rp.moderation_status='visible'
      ),0) as review_photo_count
    from public.location_visits v
    join public.locations l on l.id=v.location_id
    left join lateral (
      select c.id,c.checked_in_at,c.verification_method,c.metadata
      from public.check_ins c
      where c.user_id=v_uid
        and c.location_id=v.location_id
        and (
          c.metadata->>'presence_visit_id'=v.id::text
          or c.checked_in_at between v.occurred_at-interval '15 minutes'
            and coalesce(v.departed_at,v.last_seen_at,v.occurred_at)+interval '15 minutes'
        )
      order by
        case when c.metadata->>'presence_visit_id'=v.id::text then 0 else 1 end,
        c.checked_in_at desc
      limit 1
    ) ci on true
    left join lateral (
      select review.id,review.created_at
      from public.reviews review
      where review.user_id=v_uid
        and review.location_id=v.location_id
        and review.check_in_id=ci.id
      order by review.created_at desc
      limit 1
    ) r on true
    where v.user_id=v_uid
      and v.occurred_at>=now()-make_interval(days=>v_days)
  ), states as (
    select *,
      check_in_id is not null as verified,
      check_in_id is not null and progression_eligible and review_id is null as review_ready,
      check_in_id is null and review_id is null and verification_expires_at>=now() as verification_available,
      review_id is not null and review_photo_count < 3 as photo_open
    from visit_rows
  )
  select jsonb_build_object(
    'period_days',v_days,
    'started_at',now()-make_interval(days=>v_days),
    'visit_count',count(*),
    'place_count',count(distinct location_id),
    'verified_visit_count',count(*) filter(where verified),
    'reviewed_count',count(*) filter(where review_id is not null),
    'review_ready_count',count(*) filter(where review_ready),
    'verification_available_count',count(*) filter(where verification_available),
    'photo_open_count',count(*) filter(where photo_open),
    'visits',coalesce(jsonb_agg(jsonb_build_object(
      'visit_id',visit_id,
      'location_id',location_id,
      'location_name',location_name,
      'visited_at',visited_at,
      'last_seen_at',last_seen_at,
      'departed_at',departed_at,
      'verification_expires_at',verification_expires_at,
      'check_in_id',check_in_id,
      'checked_in_at',checked_in_at,
      'verification_method',verification_method,
      'review_id',review_id,
      'reviewed_at',reviewed_at,
      'review_photo_count',review_photo_count,
      'verified',verified,
      'review_ready',review_ready,
      'verification_available',verification_available,
      'photo_open',photo_open
    ) order by visited_at desc),'[]'::jsonb)
  ) into v_result
  from states;

  return coalesce(v_result,jsonb_build_object(
    'period_days',v_days,'visit_count',0,'place_count',0,'verified_visit_count',0,
    'reviewed_count',0,'review_ready_count',0,'verification_available_count',0,
    'photo_open_count',0,'visits','[]'::jsonb
  ));
end;
$function$;

revoke all on function public.my_week_in_review(integer) from public,anon;
grant execute on function public.my_week_in_review(integer) to authenticated,service_role;
