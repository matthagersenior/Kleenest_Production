-- Batch: consolidate the easiest duplicate authority paths.
-- Canonical rewards authority: gamification_activity_trigger -> record_gamification_activity.
-- Canonical check-in authority: create_check_in -> check_ins triggers.
-- Canonical QR check-in authority: create_check_in with QR token.
-- No new metric/reward engine is introduced.

create or replace function public.create_check_in(p_place_id uuid, p_qr_token text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_location uuid;
  v_business uuid;
  v_check uuid;
  v_points integer := 10;
  v_existing uuid;
  v_qr uuid;
  v_event_key text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select p.location_id,l.business_id
    into v_location,v_business
  from public.places p
  join public.locations l on l.id=p.location_id
  where p.id=p_place_id and p.is_active=true;

  if v_location is null then raise exception 'Place not found'; end if;

  if p_qr_token is not null and length(trim(p_qr_token))>0 then
    select id into v_qr
    from public.qr_codes
    where code=trim(p_qr_token) and active=true and location_id=v_location
    limit 1;
    if v_qr is null then raise exception 'Invalid or inactive QR code'; end if;
  end if;

  select id into v_existing
  from public.check_ins
  where user_id=v_user
    and location_id=v_location
    and checked_in_at > now()-interval '24 hours'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'ok',true,'already_checked_in',true,'check_in_id',v_existing,'id',v_existing,
      'location_id',v_location,'business_id',v_business,'qr_code_id',v_qr,
      'points_awarded',0,'place_id',p_place_id
    );
  end if;

  -- INSERT is the only reward/check-in write boundary. The BEFORE trigger
  -- supplies the display reward/count, and the AFTER gamification trigger
  -- owns point transactions, streaks and profile points.
  insert into public.check_ins(
    user_id,location_id,qr_code_id,checked_in_at,verification_method,points_awarded,metadata
  ) values(
    v_user,v_location,v_qr,now(),case when v_qr is null then 'place' else 'qr' end,
    v_points,jsonb_build_object('place_id',p_place_id)
  ) returning id into v_check;

  v_event_key:=md5(concat_ws('|',v_user::text,'check_in',v_check::text,v_location::text));
  insert into public.data_feature_events(
    subject_type,subject_id,actor_user_id,location_id,event_type,feature_code,
    source_table,source_id,value_numeric,metadata,occurred_at,event_validity,
    confidence,deduplication_key,rate_limit_context
  ) values(
    'location',v_location,v_user,v_location,'check_in','location_checkin',
    'check_ins',v_check,v_points,
    jsonb_build_object('place_id',p_place_id,'business_id',v_business,
      'qr',v_qr is not null,'server_authoritative',true),
    now(),'valid',1,v_event_key,jsonb_build_object('server_authoritative',true)
  );

  return jsonb_build_object(
    'ok',true,'already_checked_in',false,'check_in_id',v_check,'id',v_check,
    'location_id',v_location,'business_id',v_business,'qr_code_id',v_qr,
    'points_awarded',v_points,'place_id',p_place_id
  );
end
$function$;

create or replace function public.verify_checkin(
  p_qr_code text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.check_ins
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_qr public.qr_codes%rowtype;
  v_loc public.locations%rowtype;
  v_place_id uuid;
  v_result jsonb;
  v_check public.check_ins%rowtype;
  v_distance double precision;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_qr
  from public.qr_codes
  where code=trim(p_qr_code) and active=true
  limit 1;
  if not found then raise exception 'Invalid or inactive QR code'; end if;

  select * into v_loc
  from public.locations
  where id=v_qr.location_id
    and is_active=true
    and verification_status='verified';
  if not found then raise exception 'Location is not currently available for check-in'; end if;

  if p_lat is not null and p_lng is not null and v_loc.geom is not null then
    v_distance:=extensions.st_distance(
      v_loc.geom,
      extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography
    );
    if v_distance>30 then raise exception 'You must be within about 100 feet of this location'; end if;
  end if;

  select id into v_place_id
  from public.places
  where location_id=v_loc.id and is_active=true
  order by created_at asc nulls last
  limit 1;

  if v_place_id is null then raise exception 'No active place is configured for this location'; end if;

  v_result:=public.create_check_in(v_place_id,trim(p_qr_code));
  select * into v_check from public.check_ins where id=(v_result->>'check_in_id')::uuid;

  return v_check;
end
$function$;

create or replace function public.join_contest(p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  affected integer:=0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.has_kleenest_premium() then raise exception 'premium_required'; end if;
  if not exists(
    select 1 from public.contests
    where id=p_contest_id and active and starts_at<=now() and ends_at>now()
  ) then raise exception 'contest_unavailable'; end if;

  insert into public.contest_entries(contest_id,user_id)
  values(p_contest_id,auth.uid())
  on conflict do nothing;
  get diagnostics affected=row_count;

  -- Contest-entry reward is owned exclusively by the AFTER INSERT
  -- gamification trigger. This function only owns contest membership.
  return jsonb_build_object('joined',true,'new_entry',affected>0);
end
$function$;

comment on function public.create_check_in(uuid,text) is
'Canonical check-in write boundary. Rewards are owned by check_ins triggers/gamification; callers must not award points separately.';
comment on function public.verify_checkin(text,double precision,double precision) is
'Compatibility wrapper for QR check-in. Delegates to canonical create_check_in and never awards QR rewards independently.';
comment on function public.join_contest(uuid) is
'Canonical contest membership write. Contest-entry rewards are owned by gamification_contest_entries trigger.';
