
alter table public.discovery_photos
  add column if not exists moderation_status text not null default 'visible',
  add column if not exists moderation_reason text;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.discovery_photos'::regclass
      and conname='discovery_photos_moderation_status_check'
  ) then
    alter table public.discovery_photos
      add constraint discovery_photos_moderation_status_check
      check (moderation_status in ('visible','hidden','pending'));
  end if;
end $$;

create index if not exists discovery_photos_visible_location_idx
  on public.discovery_photos(location_id,created_at desc)
  where moderation_status='visible';

drop policy if exists discovery_photos_read on public.discovery_photos;
drop policy if exists discovery_photos_self_read on public.discovery_photos;

revoke all on table public.discovery_photos from public,anon,authenticated;
grant select on table public.discovery_photos to authenticated;
grant select,insert,update,delete on table public.discovery_photos to service_role;

create policy discovery_photos_self_read
  on public.discovery_photos
  for select
  to authenticated
  using (user_id=(select auth.uid()));

create or replace function public.discovery_photos_for_location(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',p.id,
        'storage_path',p.storage_path,
        'mime_type',p.mime_type,
        'width',p.width,
        'height',p.height,
        'created_at',p.created_at
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select p.*
    from public.discovery_photos p
    join public.locations l on l.id=p.location_id and l.is_active=true
    where p.location_id=p_location_id
      and p.moderation_status='visible'
    order by p.created_at desc
    limit 50
  ) p;
$$;

revoke all on function public.discovery_photos_for_location(uuid) from public;
grant execute on function public.discovery_photos_for_location(uuid) to anon,authenticated,service_role;

create or replace function public.get_location_occupancy_summary(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with recent as (
  select user_id,occupancy_count,capacity_count,queue_count,wait_minutes,confidence,observed_at
  from public.location_occupancy_observations
  where location_id=p_location_id
    and observed_at>=now()-interval '2 hours'
), agg as (
  select
    count(*)::int sample_count,
    count(distinct user_id)::int contributor_count,
    round(avg(occupancy_count)::numeric,1) avg_occupancy_count,
    round(avg(capacity_count)::numeric,1) avg_capacity_count,
    round(avg(case when capacity_count>0 then occupancy_count::numeric/capacity_count*100 end)::numeric,1) avg_utilization_pct,
    round(avg(queue_count)::numeric,1) avg_queue_count,
    round(avg(wait_minutes)::numeric,1) avg_wait_minutes,
    round(avg(confidence)::numeric,2) confidence,
    max(observed_at) freshest_observed_at
  from recent
), safe as (
  select *,
    sample_count>=2 and contributor_count>=2 as publishable
  from agg
)
select jsonb_build_object(
  'location_id',p_location_id,
  'window_minutes',120,
  'privacy_rule','minimum_2_distinct_contributors',
  'privacy_suppressed',not publishable,
  'sample_count',case when publishable then sample_count else 0 end,
  'occupancy_count',case when publishable then avg_occupancy_count end,
  'capacity_count',case when publishable then avg_capacity_count end,
  'utilization_pct',case when publishable then avg_utilization_pct end,
  'queue_count',case when publishable then avg_queue_count end,
  'wait_minutes',case when publishable then avg_wait_minutes end,
  'confidence',case when publishable then confidence end,
  'freshest_observed_at',case when publishable then freshest_observed_at end,
  'fresh',publishable and freshest_observed_at>=now()-interval '30 minutes'
)
from safe
where exists(select 1 from public.locations l where l.id=p_location_id and l.is_active=true);
$$;

revoke all on function public.get_location_occupancy_summary(uuid) from public;
grant execute on function public.get_location_occupancy_summary(uuid) to anon,authenticated,service_role;

create or replace function public.get_location_occupancy_trend(
  p_location_id uuid,
  p_hours integer default 24,
  p_bucket_minutes integer default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_hours integer:=least(greatest(coalesce(p_hours,24),4),72);
  v_bucket integer:=least(greatest(coalesce(p_bucket_minutes,120),30),360);
begin
  if not exists(select 1 from public.locations where id=p_location_id and is_active=true) then
    raise exception 'Canonical location not found or inactive';
  end if;

  return jsonb_build_object(
    'location_id',p_location_id,
    'window_hours',v_hours,
    'bucket_minutes',v_bucket,
    'privacy_rule','minimum_2_distinct_contributors_per_bucket',
    'buckets',(
      with raw as (
        select
          to_timestamp(floor(extract(epoch from observed_at)/(v_bucket*60))*(v_bucket*60)) at time zone 'UTC' bucket_start,
          user_id,occupancy_count,capacity_count,queue_count,wait_minutes,confidence,observed_at
        from public.location_occupancy_observations
        where location_id=p_location_id
          and observed_at>=now()-make_interval(hours=>v_hours)
      ), agg as (
        select
          bucket_start,
          count(*)::int sample_count,
          count(distinct user_id)::int contributor_count,
          round(avg(occupancy_count)::numeric,1) occupancy_count,
          round(avg(case when capacity_count>0 then occupancy_count::numeric/capacity_count*100 end)::numeric,1) utilization_pct,
          round(avg(queue_count)::numeric,1) queue_count,
          round(avg(wait_minutes)::numeric,1) wait_minutes,
          round(avg(confidence)::numeric,2) confidence,
          max(observed_at) freshest_observed_at
        from raw
        group by bucket_start
        having count(*)>=2 and count(distinct user_id)>=2
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'bucket_start',bucket_start,
            'sample_count',sample_count,
            'contributor_count',contributor_count,
            'occupancy_count',occupancy_count,
            'utilization_pct',utilization_pct,
            'queue_count',queue_count,
            'wait_minutes',wait_minutes,
            'confidence',confidence,
            'freshest_observed_at',freshest_observed_at
          )
          order by bucket_start
        ),
        '[]'::jsonb
      )
      from agg
    )
  );
end;
$$;

revoke all on function public.get_location_occupancy_trend(uuid,integer,integer) from public;
grant execute on function public.get_location_occupancy_trend(uuid,integer,integer) to anon,authenticated,service_role;

create or replace function public.get_location_preventive_maintenance_status(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with w as (
  select w.*
  from public.business_restroom_preventive_work_orders w
  join public.locations l on l.id=w.location_id and l.is_active=true
  where w.location_id=p_location_id
), latest_effective as (
  select
    w1.amenity_id,
    a.name amenity_name,
    w1.verified_at,
    (
      select min(o.observed_at)
      from public.location_amenity_observations o
      where o.location_id=w1.location_id
        and o.amenity_id=w1.amenity_id
        and o.status='absent'
        and w1.verified_at is not null
        and o.observed_at>w1.verified_at
        and o.id is distinct from w1.verification_observation_id
    ) recurrence_at
  from w w1
  left join public.amenities a on a.id=w1.amenity_id
  where w1.verification_status='effective'
  order by w1.verified_at desc nulls last
  limit 1
), agg as (
  select
    count(*) filter(where status in('planned','assigned','in_progress'))::int active,
    count(*) filter(where status='completed')::int completed,
    count(*) filter(where status='completed' and verification_status='pending')::int awaiting_verification,
    count(*) filter(where status='completed' and verification_status='effective')::int verified_effective,
    count(*) filter(where status='completed' and verification_status='failed')::int failed_verification,
    max(completed_at) filter(where status='completed') latest_completed_at,
    max(verified_at) latest_verified_at
  from w
)
select jsonb_build_object(
  'location_id',p_location_id,
  'active_preventive_work',agg.active,
  'completed_preventive_work',agg.completed,
  'awaiting_verification',agg.awaiting_verification,
  'verified_effective',agg.verified_effective,
  'failed_verification',agg.failed_verification,
  'latest_completed_at',agg.latest_completed_at,
  'latest_verified_at',agg.latest_verified_at,
  'latest_effective_amenity',(select amenity_name from latest_effective),
  'recurrence_after_latest_effective_at',(select recurrence_at from latest_effective),
  'maintenance_effectiveness_state',case
    when (select recurrence_at from latest_effective) is not null
      and (select recurrence_at from latest_effective)<=(select verified_at from latest_effective)+interval '30 days'
      then 'recurrence_detected'
    when (select verified_at from latest_effective) is not null
      and (select verified_at from latest_effective)<=now()-interval '30 days'
      then 'durable_30d'
    when (select verified_at from latest_effective) is not null then 'holding_so_far'
    when agg.failed_verification>0 then 'failed_verification'
    when agg.awaiting_verification>0 then 'pending_verification'
    else 'no_verified_prevention'
  end,
  'maintenance_state',case
    when agg.failed_verification>0 and agg.active>0 then 'followup_required'
    when agg.awaiting_verification>0 then 'awaiting_independent_verification'
    when agg.active>0 then 'prevention_active'
    when agg.verified_effective>0 then 'independently_verified_history'
    when agg.completed>0 then 'preventive_history'
    else 'none'
  end
)
from agg
where exists(select 1 from public.locations l where l.id=p_location_id and l.is_active=true);
$$;

revoke all on function public.get_location_preventive_maintenance_status(uuid) from public;
grant execute on function public.get_location_preventive_maintenance_status(uuid) to anon,authenticated,service_role;

create or replace function public.get_location_recovery_history(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with rows as (
  select
    a.name amenity_name,
    c.status,
    c.opened_at,
    c.resolved_at,
    c.resolution_snapshot,
    so.observed_at source_observed_at,
    ro.observed_at resolution_observed_at,
    lp.storage_path proof_storage_path,
    lp.created_at proof_created_at,
    case
      when c.status='resolved' and coalesce((c.resolution_snapshot->>'auto_resolved')::boolean,false) then 'community_confirmation'
      when c.status='resolved' and c.resolution_observation_id is not null then 'business_remediation'
      when c.status in ('open','assigned','in_progress') then 'business_response_active'
      else c.status
    end resolution_method,
    case
      when c.status='open' then 'business_alerted'
      when c.status in ('assigned','in_progress') then 'business_addressing'
      when c.status='resolved' then 'addressed'
      else c.status
    end response_status
  from public.business_restroom_remediation_cases c
  join public.locations l on l.id=c.location_id and l.is_active=true
  join public.amenities a on a.id=c.amenity_id
  left join public.location_amenity_observations so on so.id=c.source_observation_id
  left join public.location_amenity_observations ro on ro.id=c.resolution_observation_id
  left join public.location_photos lp
    on lp.id=c.resolution_media_id
   and lp.moderation_status='visible'
  where c.location_id=p_location_id
    and c.status<>'dismissed'
    and c.opened_at>=now()-interval '180 days'
  order by c.opened_at desc
  limit 24
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'amenity_name',amenity_name,
      'response_status',response_status,
      'resolution_method',resolution_method,
      'opened_at',opened_at,
      'source_observed_at',source_observed_at,
      'resolved_at',resolved_at,
      'resolution_observed_at',resolution_observed_at,
      'proof_available',proof_storage_path is not null,
      'proof_storage_path',proof_storage_path,
      'proof_created_at',proof_created_at,
      'sla_met',case
        when status='resolved' and resolution_snapshot ? 'sla_met'
          then (resolution_snapshot->>'sla_met')::boolean
        else null
      end
    )
    order by opened_at desc
  ),
  '[]'::jsonb
)
from rows;
$$;

revoke all on function public.get_location_recovery_history(uuid) from public;
grant execute on function public.get_location_recovery_history(uuid) to anon,authenticated,service_role;

create or replace function public.mobile_location_review_evidence(
  p_location_id uuid,
  p_limit integer default 30
)
returns table(
  review_id uuid,
  verified_checked_in_at timestamptz,
  verified_check_in_method text,
  verified_distance_meters double precision,
  photo_evidence_count bigint,
  amenity_evidence_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
  with published as (
    select r.id,r.user_id,r.location_id,r.check_in_id,r.created_at
    from public.reviews r
    where r.location_id=p_location_id
      and r.status='published'
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit,30),1),100)
  )
  select
    p.id,
    case when ci.id is not null then ci.checked_in_at end,
    case when ci.id is not null then ci.verification_method end,
    case when ci.id is not null then ci.distance_meters end,
    (
      select count(*)
      from public.review_photos rp
      where rp.review_id=p.id
        and rp.moderation_status='visible'
    ),
    (
      select count(distinct ao.amenity_id)
      from public.location_amenity_observations ao
      where ci.id is not null
        and ao.location_id=p.location_id
        and ao.user_id=p.user_id
        and ao.check_in_id=ci.id
    )
  from published p
  left join public.check_ins ci
    on ci.id=p.check_in_id
   and ci.user_id=p.user_id
   and ci.location_id=p.location_id
  order by p.created_at desc;
$$;

revoke all on function public.mobile_location_review_evidence(uuid,integer) from public;
grant execute on function public.mobile_location_review_evidence(uuid,integer) to anon,authenticated,service_role;

create or replace function public.mobile_location_trust_summaries(p_location_ids uuid[])
returns table(
  location_id uuid,
  verified_visit_count bigint,
  verified_review_count bigint,
  photo_evidence_count bigint,
  amenity_evidence_count bigint,
  latest_verified_at timestamptz,
  latest_amenity_observed_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(cardinality(p_location_ids),0)>100 then
    raise exception 'A maximum of 100 location ids may be requested';
  end if;

  return query
  with requested as (
    select distinct x.location_id
    from unnest(coalesce(p_location_ids,'{}'::uuid[])) x(location_id)
  ), published as (
    select r.id review_id,r.location_id,r.check_in_id
    from public.reviews r
    join requested q on q.location_id=r.location_id
    where r.status='published'
  ), visits as (
    select
      p.location_id,
      count(distinct p.check_in_id) filter(where p.check_in_id is not null) verified_visit_count,
      count(*) filter(where p.check_in_id is not null) verified_review_count,
      max(ci.checked_in_at) latest_verified_at
    from published p
    left join public.check_ins ci
      on ci.id=p.check_in_id and ci.location_id=p.location_id
    group by p.location_id
  ), photos as (
    select p.location_id,count(rp.id) photo_evidence_count
    from published p
    join public.review_photos rp
      on rp.review_id=p.review_id
     and rp.moderation_status='visible'
    group by p.location_id
  ), amenities as (
    select
      p.location_id,
      count(distinct ao.amenity_id) amenity_evidence_count,
      max(ao.observed_at) latest_amenity_observed_at
    from published p
    join public.location_amenity_observations ao
      on ao.check_in_id=p.check_in_id
     and ao.location_id=p.location_id
    where p.check_in_id is not null
    group by p.location_id
  )
  select
    q.location_id,
    coalesce(v.verified_visit_count,0),
    coalesce(v.verified_review_count,0),
    coalesce(ph.photo_evidence_count,0),
    coalesce(a.amenity_evidence_count,0),
    v.latest_verified_at,
    a.latest_amenity_observed_at
  from requested q
  left join visits v on v.location_id=q.location_id
  left join photos ph on ph.location_id=q.location_id
  left join amenities a on a.location_id=q.location_id;
end;
$$;

revoke all on function public.mobile_location_trust_summaries(uuid[]) from public;
grant execute on function public.mobile_location_trust_summaries(uuid[]) to anon,authenticated,service_role;

create or replace function public.mobile_review_photos_for_reviews(p_review_ids uuid[])
returns table(
  review_photo_id uuid,
  review_id uuid,
  storage_path text,
  mime_type text,
  width integer,
  height integer,
  sort_order integer,
  helpful_votes integer,
  not_helpful_votes integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(cardinality(p_review_ids),0)>100 then
    raise exception 'A maximum of 100 review ids may be requested';
  end if;

  return query
  with requested as (
    select distinct x.review_id
    from unnest(coalesce(p_review_ids,'{}'::uuid[])) x(review_id)
  )
  select
    rp.id,
    rp.review_id,
    rp.storage_path,
    rp.mime_type,
    rp.width,
    rp.height,
    rp.sort_order,
    (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rp.id and v.vote='helpful'),
    (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rp.id and v.vote='not_helpful')
  from requested q
  join public.review_photos rp on rp.review_id=q.review_id
  join public.reviews r on r.id=rp.review_id
  where r.status='published'
    and rp.moderation_status='visible'
  order by rp.review_id,rp.sort_order,rp.created_at;
end;
$$;

revoke all on function public.mobile_review_photos_for_reviews(uuid[]) from public;
grant execute on function public.mobile_review_photos_for_reviews(uuid[]) to anon,authenticated,service_role;

create or replace function public.public_qr_action_payload(p_action_type text,p_payload jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select case
    when lower(coalesce(p_action_type,''))='smart_device_command'
      then jsonb_build_object('requires_authentication',true)
    else coalesce(p_payload,'{}'::jsonb)
      - array[
        'deviceId','device_id','command','arguments',
        'secret','token','api_key','apiKey','credential','credentials',
        'password','webhook_secret','webhookSecret'
      ]::text[]
  end;
$$;

revoke all on function public.public_qr_action_payload(text,jsonb) from public,anon,authenticated;
grant execute on function public.public_qr_action_payload(text,jsonb) to service_role;

create or replace function public.get_public_qr_landing(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  q public.qr_codes;
  b public.businesses;
  l public.locations;
  v jsonb;
begin
  if nullif(trim(coalesce(p_qr_code,'')),'') is null
     or length(trim(p_qr_code))>256 then
    raise exception 'Invalid Kleenest QR';
  end if;

  select * into q
  from public.qr_codes
  where code=trim(p_qr_code) and active=true
  limit 1;
  if not found then raise exception 'Invalid or inactive Kleenest QR'; end if;

  select * into b from public.businesses where id=q.business_id;
  select * into l from public.locations where id=q.location_id and is_active=true;
  if q.location_id is not null and not found then
    raise exception 'QR location unavailable';
  end if;

  v:=jsonb_build_object(
    'id',q.id,
    'code',q.code,
    'business_id',q.business_id,
    'business_name',b.name,
    'business_logo_url',b.logo_url,
    'location_id',q.location_id,
    'location_name',l.name,
    'address',l.address,
    'label',q.label,
    'purpose',q.purpose,
    'action_type',q.action_type,
    'action_payload',public.public_qr_action_payload(q.action_type,q.action_payload),
    'customization',q.customization
  );

  insert into public.qr_attribution_events(
    qr_code_id,location_id,business_id,user_id,action_type,source,metadata
  )
  values(
    q.id,q.location_id,q.business_id,auth.uid(),'scan','public_qr_landing',
    jsonb_build_object('anonymous',auth.uid() is null)
  );

  return v;
end;
$$;

revoke all on function public.get_public_qr_landing(text) from public;
grant execute on function public.get_public_qr_landing(text) to anon,authenticated,service_role;

create or replace function public.map_network_nearby_v2(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 30000,
  p_limit integer default 250,
  p_category text default null,
  p_search text default null,
  p_amenity_names text[] default '{}'::text[]
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_radius integer:=least(greatest(coalesce(p_radius_m,30000),100),100000);
  v_limit integer:=least(greatest(coalesce(p_limit,250),1),500);
  v_category text:=nullif(left(trim(coalesce(p_category,'')),50),'');
  v_search text:=nullif(left(trim(coalesce(p_search,'')),200),'');
  v_amenities text[];
begin
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'Valid latitude and longitude are required';
  end if;

  select coalesce(array_agg(x.name order by x.name),'{}'::text[])
    into v_amenities
  from (
    select distinct left(trim(a),100) name
    from unnest(coalesce(p_amenity_names,'{}'::text[])) a
    where nullif(trim(a),'') is not null
    limit 50
  ) x;

  return query
  select to_jsonb(n) || jsonb_build_object(
    'business_id',coalesce(l.claimed_business_id,l.business_id),
    'business_name',b.name,
    'business_logo_url',b.logo_url,
    'place_type',l.place_type,
    'phone',l.phone,
    'website',l.website,
    'description',l.description,
    'accessible',l.accessible,
    'changing_table',l.changing_table,
    'smart_bathroom',l.smart_bathroom,
    'cleaning_schedule',l.cleaning_schedule,
    'promo_offer',l.promo_offer
  )
  from public.map_network_nearby_v1(
    p_lat,p_lng,v_radius,v_limit,
    case when lower(coalesce(v_category,''))='restroom' then 'all' else v_category end,
    v_search,v_amenities
  ) n
  left join public.locations l on l.id=n.location_id
  left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
  order by n.distance_meters;
end;
$$;

revoke all on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) from public;
grant execute on function public.map_network_nearby_v2(double precision,double precision,integer,integer,text,text,text[]) to anon,authenticated,service_role;

revoke all on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) from public,anon,authenticated;
grant execute on function public.map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[]) to service_role;

revoke all on function public.map_network_nearby_strict_v1(double precision,double precision,integer,integer,text,text,text[]) from public,anon,authenticated;
grant execute on function public.map_network_nearby_strict_v1(double precision,double precision,integer,integer,text,text,text[]) to service_role;
