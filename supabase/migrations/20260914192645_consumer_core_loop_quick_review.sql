create table if not exists public.consumer_core_loop_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  location_id uuid null references public.locations(id) on delete set null,
  session_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint consumer_core_loop_events_event_name_chk check (
    event_name = any(array[
      'app_open','nearby_results_shown','place_selected','navigation_started',
      'arrival_detected','review_started','review_submit_attempt',
      'review_submit_success','review_submit_failed','review_photo_added',
      'review_done'
    ]::text[])
  ),
  constraint consumer_core_loop_events_metadata_object_chk check (jsonb_typeof(metadata)='object')
);

create index if not exists consumer_core_loop_events_user_time_idx
  on public.consumer_core_loop_events(user_id,occurred_at desc);
create index if not exists consumer_core_loop_events_event_time_idx
  on public.consumer_core_loop_events(event_name,occurred_at desc);
create index if not exists consumer_core_loop_events_location_time_idx
  on public.consumer_core_loop_events(location_id,occurred_at desc)
  where location_id is not null;

alter table public.consumer_core_loop_events enable row level security;
revoke all on table public.consumer_core_loop_events from public,anon,authenticated;

create or replace function public.record_consumer_core_loop_event(
  p_event_name text,
  p_location_id uuid default null,
  p_session_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  allowed constant text[] := array[
    'app_open','nearby_results_shown','place_selected','navigation_started',
    'arrival_detected','review_started','review_submit_attempt',
    'review_submit_success','review_submit_failed','review_photo_added',
    'review_done'
  ];
begin
  if uid is null then
    return;
  end if;
  if not (p_event_name = any(allowed)) then
    raise exception 'INVALID_CORE_LOOP_EVENT';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'INVALID_CORE_LOOP_METADATA';
  end if;

  insert into public.consumer_core_loop_events(user_id,event_name,location_id,session_id,metadata)
  values(
    uid,
    p_event_name,
    p_location_id,
    nullif(left(coalesce(p_session_id,''),120),''),
    p_metadata
  );
end;
$function$;

revoke all on function public.record_consumer_core_loop_event(text,uuid,text,jsonb) from public;
grant execute on function public.record_consumer_core_loop_event(text,uuid,text,jsonb) to authenticated,service_role;

create or replace function public.create_review(
  p_location_id uuid,
  p_check_in_id uuid,
  p_stars smallint,
  p_cleanliness_pct numeric,
  p_comment text
)
returns public.reviews
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_review public.reviews;
  v_check timestamptz;
  v_method text;
  v_metadata jsonb;
  v_verified boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_check_in_id is null then raise exception 'CHECK_IN_REQUIRED'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'STARS_OUT_OF_RANGE'; end if;
  if p_cleanliness_pct is not null and (p_cleanliness_pct < 0 or p_cleanliness_pct > 100) then
    raise exception 'CLEANLINESS_OUT_OF_RANGE';
  end if;

  select checked_in_at,verification_method,coalesce(metadata,'{}'::jsonb)
  into v_check,v_method,v_metadata
  from public.check_ins
  where id=p_check_in_id
    and user_id=auth.uid()
    and location_id=p_location_id;

  if not found then raise exception 'CHECK_IN_DOES_NOT_BELONG_TO_USER_AND_LOCATION'; end if;

  v_verified :=
    lower(coalesce(v_method,'')) in ('gps','qr','code','place')
    or coalesce((v_metadata->>'server_authoritative')::boolean,false);

  if not v_verified then
    raise exception 'CHECK_IN_NOT_VERIFIED_FOR_REVIEW';
  end if;

  if exists(
    select 1 from public.reviews r
    where r.user_id=auth.uid() and r.check_in_id=p_check_in_id
  ) then
    raise exception 'REVIEW_ALREADY_EXISTS_FOR_CHECK_IN';
  end if;

  insert into public.reviews(location_id,user_id,check_in_id,stars,cleanliness_pct,comment,status)
  values(
    p_location_id,auth.uid(),p_check_in_id,p_stars,p_cleanliness_pct,
    nullif(trim(coalesce(p_comment,'')),''),
    'published'
  )
  returning * into v_review;

  return v_review;
end;
$function$;

create or replace function public.consumer_quick_review(
  p_location_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_stars smallint,
  p_cleanliness_pct numeric,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  v_check jsonb;
  v_check_in_id uuid;
  v_review public.reviews;
  v_existing public.reviews;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_location_id is null then raise exception 'LOCATION_REQUIRED'; end if;
  if p_lat is null or p_lng is null then raise exception 'LOCATION_REQUIRED'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'STARS_OUT_OF_RANGE'; end if;
  if p_cleanliness_pct is null or p_cleanliness_pct < 0 or p_cleanliness_pct > 100 then
    raise exception 'CLEANLINESS_REQUIRED';
  end if;

  v_check := public.kleenest_map_check_in(p_location_id,p_lat,p_lng);
  v_check_in_id := nullif(v_check->>'check_in_id','')::uuid;

  if v_check_in_id is null then
    raise exception 'REVIEW_VISIT_UNAVAILABLE';
  end if;

  update public.check_ins
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'review_intent',true,
    'review_intent_at',now(),
    'review_intent_source','consumer_quick_review'
  )
  where id=v_check_in_id and user_id=uid;

  select *
  into v_existing
  from public.reviews r
  where r.user_id=uid
    and r.location_id=p_location_id
    and r.check_in_id=v_check_in_id
  order by r.created_at desc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'success',true,
      'already_reviewed',true,
      'review',to_jsonb(v_existing),
      'check_in',v_check
    );
  end if;

  select *
  into v_review
  from public.create_review(
    p_location_id,
    v_check_in_id,
    p_stars,
    p_cleanliness_pct,
    coalesce(p_comment,'')
  );

  return jsonb_build_object(
    'success',true,
    'already_reviewed',false,
    'review',to_jsonb(v_review),
    'check_in',v_check
  );
end;
$function$;

revoke all on function public.consumer_quick_review(uuid,double precision,double precision,smallint,numeric,text) from public;
grant execute on function public.consumer_quick_review(uuid,double precision,double precision,smallint,numeric,text) to authenticated,service_role;
