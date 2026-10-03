-- Converge schema that was previously applied directly to Production and
-- install an exact O(1) canonical-location metric for Owner/admin surfaces.

-- Current authoritative check-in accuracy envelope recovered from Production.
CREATE OR REPLACE FUNCTION public.kleenest_map_check_in_v2(p_location_id uuid, p_lat double precision, p_lng double precision, p_accuracy_m double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  loc record;
  distance_m double precision;
  radius_m double precision;
  accuracy_allowance_m double precision := 0;
  effective_radius_m double precision;
  assisted boolean := false;
  result jsonb;
  check_in_uuid uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_location_id is null then raise exception 'LOCATION_REQUIRED'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'LOCATION_REQUIRED';
  end if;

  select
    id,
    latitude,
    longitude,
    greatest(25,least(coalesce(geofence_radius_m,150),5000))::double precision as radius_m
  into loc
  from public.locations
  where id=p_location_id
    and is_active=true
    and verification_status in ('pending'::public.verification_status,'verified'::public.verification_status);

  if not found then raise exception 'LOCATION_NOT_VERIFIED'; end if;
  if loc.latitude is null or loc.longitude is null then raise exception 'LOCATION_COORDINATES_UNAVAILABLE'; end if;

  radius_m := loc.radius_m;
  distance_m := 6371000.0*2*asin(sqrt(
    power(sin(radians(p_lat-loc.latitude)/2),2)
    +cos(radians(loc.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-loc.longitude)/2),2)
  ));

  -- Only a bounded, plausible precise-location uncertainty may widen the edge.
  -- Large/unknown accuracy values receive no allowance.
  if p_accuracy_m is not null and p_accuracy_m >= 0 and p_accuracy_m <= 100 then
    accuracy_allowance_m := least(p_accuracy_m,75);
  end if;
  effective_radius_m := least(5000, radius_m + accuracy_allowance_m);
  assisted := distance_m > radius_m and distance_m <= effective_radius_m and accuracy_allowance_m > 0;

  if distance_m > effective_radius_m then
    raise exception 'OUTSIDE_GEOFENCE distance_m=% radius_m=% effective_radius_m=% accuracy_m=%',
      round(distance_m::numeric,1),
      round(radius_m::numeric,1),
      round(effective_radius_m::numeric,1),
      coalesce(round(p_accuracy_m::numeric,1),-1);
  end if;

  if assisted then
    perform pg_advisory_xact_lock(
      hashtextextended('kleenest:checkin:'||uid::text||':'||p_location_id::text,0)
    );

    insert into public.location_visits(
      user_id,location_id,occurred_at,context,
      last_seen_at,verification_expires_at,
      entry_latitude,entry_longitude,entry_distance_meters,
      last_latitude,last_longitude,last_distance_meters
    )
    values(
      uid,p_location_id,now(),
      jsonb_build_object(
        'source','explicit_check_in_accuracy_envelope',
        'explicit_target',true,
        'presence_verified',true,
        'auto_check_in',false,
        'server_authoritative',true,
        'verification_window_minutes',60,
        'reported_accuracy_m',p_accuracy_m,
        'base_radius_m',radius_m,
        'effective_radius_m',effective_radius_m,
        'accuracy_assisted',true
      ),
      now(),now()+interval '60 minutes',
      p_lat,p_lng,distance_m,
      p_lat,p_lng,distance_m
    )
    on conflict (user_id,location_id) where departed_at is null
    do update set
      last_seen_at=excluded.last_seen_at,
      verification_expires_at=excluded.verification_expires_at,
      last_latitude=excluded.last_latitude,
      last_longitude=excluded.last_longitude,
      last_distance_meters=excluded.last_distance_meters,
      context=coalesce(public.location_visits.context,'{}'::jsonb)||excluded.context;
  end if;

  result := public.kleenest_map_check_in(p_location_id,p_lat,p_lng);

  if assisted then
    begin
      check_in_uuid := nullif(result->>'check_in_id','')::uuid;
    exception when invalid_text_representation then
      check_in_uuid := null;
    end;

    if check_in_uuid is not null then
      update public.check_ins
      set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'source','explicit_live_geofence_accuracy_envelope',
        'reported_accuracy_m',p_accuracy_m,
        'base_radius_meters',radius_m,
        'effective_radius_meters',effective_radius_m,
        'accuracy_assisted',true,
        'server_authoritative',true
      )
      where id=check_in_uuid and user_id=uid;
    end if;
  end if;

  return coalesce(result,'{}'::jsonb)||jsonb_build_object(
    'reported_accuracy_m',p_accuracy_m,
    'base_geofence_radius_meters',radius_m,
    'effective_geofence_radius_meters',effective_radius_m,
    'accuracy_assisted',assisted,
    'verified_from',case when assisted then 'explicit_live_geofence_accuracy_envelope' else coalesce(result->>'verified_from','explicit_live_geofence') end
  );
end;
$function$;


revoke all on function public.kleenest_map_check_in_v2(uuid,double precision,double precision,double precision)
  from public,anon;
grant execute on function public.kleenest_map_check_in_v2(uuid,double precision,double precision,double precision)
  to authenticated,service_role;

-- Current authoritative Owner sponsored-governance shape.
alter table public.sponsored_campaigns
  add column if not exists business_id uuid references public.businesses(id) on delete set null,
  add column if not exists submission_status text not null default 'owner_managed',
  add column if not exists review_note text,
  add column if not exists archived_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz;

alter table public.sponsored_campaigns
  drop constraint if exists sponsored_campaigns_submission_status_check;
alter table public.sponsored_campaigns
  add constraint sponsored_campaigns_submission_status_check
  check (submission_status in ('owner_managed','draft','submitted','approved','rejected','withdrawn'));

create index if not exists sponsored_campaigns_business_submission_idx
  on public.sponsored_campaigns(business_id,submission_status,updated_at desc)
  where archived_at is null;

create table if not exists public.sponsorship_runtime_settings(
  singleton boolean primary key default true check(singleton),
  sponsored_serving_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.sponsorship_runtime_settings enable row level security;
revoke all on table public.sponsorship_runtime_settings from public,anon,authenticated;
grant select on table public.sponsorship_runtime_settings to service_role;

insert into public.sponsorship_runtime_settings(singleton,sponsored_serving_enabled,updated_at)
values(true,true,now())
on conflict(singleton) do nothing;

CREATE OR REPLACE FUNCTION public.owner_review_sponsored_campaign(p_campaign_id uuid, p_decision text, p_review_note text DEFAULT NULL::text, p_reason text DEFAULT 'KleenestOS sponsored campaign review'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if p_decision not in ('approve','reject') then raise exception 'decision must be approve or reject' using errcode='22023'; end if;
  select to_jsonb(c) into v_before from public.sponsored_campaigns c
  where c.id=p_campaign_id and c.business_id is not null and c.archived_at is null;
  if v_before is null then raise exception 'business sponsored campaign not found' using errcode='22023'; end if;

  update public.sponsored_campaigns
  set submission_status=case when p_decision='approve' then 'approved' else 'rejected' end,
      status=case when p_decision='approve' then 'active' else 'draft' end,
      review_note=nullif(trim(coalesce(p_review_note,'')),''),
      updated_by=auth.uid(),updated_at=now()
  where id=p_campaign_id
  returning to_jsonb(public.sponsored_campaigns) into v_after;

  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),p_decision,'sponsored_campaign',p_campaign_id::text,v_before,v_after,p_reason);
  return v_after;
end;
$function$;


CREATE OR REPLACE FUNCTION public.owner_set_sponsorship_enabled(p_enabled boolean, p_reason text DEFAULT 'KleenestOS global sponsored serving update'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(s) into v_before from public.sponsorship_runtime_settings s where s.singleton=true;
  insert into public.sponsorship_runtime_settings(singleton,sponsored_serving_enabled,updated_by,updated_at)
  values(true,p_enabled,auth.uid(),now())
  on conflict(singleton) do update set sponsored_serving_enabled=excluded.sponsored_serving_enabled,updated_by=auth.uid(),updated_at=now();
  select to_jsonb(s) into v_after from public.sponsorship_runtime_settings s where s.singleton=true;
  insert into public.relevance_sponsorship_audit(actor_user_id,action,entity_type,entity_key,previous_state,next_state,reason)
  values(auth.uid(),'global_serving','sponsorship_runtime','global',v_before,v_after,p_reason);
  return v_after;
end;
$function$;


revoke all on function public.owner_set_sponsorship_enabled(boolean,text) from public,anon;
grant execute on function public.owner_set_sponsorship_enabled(boolean,text) to authenticated,service_role;
revoke all on function public.owner_review_sponsored_campaign(uuid,text,text,text) from public,anon;
grant execute on function public.owner_review_sponsored_campaign(uuid,text,text,text) to authenticated,service_role;

-- Exact canonical-location metric. Keep this private and update it once per
-- statement, not once per row, so bulk ingestion does not create a hot-row storm.
create schema if not exists internal;

create table if not exists internal.platform_metrics(
  metric_key text primary key,
  metric_value bigint not null,
  exact boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on table internal.platform_metrics from public,anon,authenticated;

insert into internal.platform_metrics(metric_key,metric_value,exact,updated_at)
select 'canonical_active_locations',count(*)::bigint,true,now()
from public.locations
where is_active=true
on conflict(metric_key) do update
set metric_value=excluded.metric_value,
    exact=true,
    updated_at=excluded.updated_at;

create or replace function internal.adjust_canonical_location_metric_after_insert()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_delta bigint;
begin
  select count(*)::bigint into v_delta from new_rows where is_active=true;
  if v_delta<>0 then
    update internal.platform_metrics
    set metric_value=metric_value+v_delta,updated_at=now(),exact=true
    where metric_key='canonical_active_locations';
  end if;
  return null;
end;
$function$;

create or replace function internal.adjust_canonical_location_metric_after_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_delta bigint;
begin
  select count(*)::bigint into v_delta from old_rows where is_active=true;
  if v_delta<>0 then
    update internal.platform_metrics
    set metric_value=greatest(0,metric_value-v_delta),updated_at=now(),exact=true
    where metric_key='canonical_active_locations';
  end if;
  return null;
end;
$function$;

create or replace function internal.adjust_canonical_location_metric_after_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_before bigint; v_after bigint; v_delta bigint;
begin
  select count(*)::bigint into v_before from old_rows where is_active=true;
  select count(*)::bigint into v_after from new_rows where is_active=true;
  v_delta:=v_after-v_before;
  if v_delta<>0 then
    update internal.platform_metrics
    set metric_value=greatest(0,metric_value+v_delta),updated_at=now(),exact=true
    where metric_key='canonical_active_locations';
  end if;
  return null;
end;
$function$;

drop trigger if exists locations_canonical_metric_insert on public.locations;
create trigger locations_canonical_metric_insert
after insert on public.locations
referencing new table as new_rows
for each statement execute function internal.adjust_canonical_location_metric_after_insert();

drop trigger if exists locations_canonical_metric_delete on public.locations;
create trigger locations_canonical_metric_delete
after delete on public.locations
referencing old table as old_rows
for each statement execute function internal.adjust_canonical_location_metric_after_delete();

drop trigger if exists locations_canonical_metric_update on public.locations;
create trigger locations_canonical_metric_update
after update on public.locations
referencing old table as old_rows new table as new_rows
for each statement execute function internal.adjust_canonical_location_metric_after_update();

create or replace function public.admin_canonical_location_metric()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_row internal.platform_metrics;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  select * into v_row
  from internal.platform_metrics
  where metric_key='canonical_active_locations';

  return jsonb_build_object(
    'canonical_active_locations',coalesce(v_row.metric_value,0),
    'exact',coalesce(v_row.exact,false),
    'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.admin_canonical_location_metric() from public,anon;
grant execute on function public.admin_canonical_location_metric() to authenticated,service_role;
