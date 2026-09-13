
create or replace view public.public_locations
with (security_invoker = true)
as
with src as (
  select
    l.*,
    b.name as business_name,
    jsonb_strip_nulls(jsonb_build_object(
      'amenity', l.source_metadata #> '{tags,amenity}',
      'toilets', l.source_metadata #> '{tags,toilets}',
      'toilets:access', l.source_metadata #> '{tags,toilets:access}',
      'toilets:wheelchair', l.source_metadata #> '{tags,toilets:wheelchair}',
      'wheelchair', l.source_metadata #> '{tags,wheelchair}',
      'changing_table', l.source_metadata #> '{tags,changing_table}',
      'opening_hours', l.source_metadata #> '{tags,opening_hours}',
      'brand', l.source_metadata #> '{tags,brand}',
      'operator', l.source_metadata #> '{tags,operator}',
      'shop', l.source_metadata #> '{tags,shop}',
      'leisure', l.source_metadata #> '{tags,leisure}',
      'tourism', l.source_metadata #> '{tags,tourism}',
      'building', l.source_metadata #> '{tags,building}',
      'internet_access', l.source_metadata #> '{tags,internet_access}',
      'drinking_water', l.source_metadata #> '{tags,drinking_water}',
      'shower', l.source_metadata #> '{tags,shower}',
      'handwashing', l.source_metadata #> '{tags,handwashing}',
      'seats', l.source_metadata #> '{tags,seats}'
    )) as public_osm_tags
  from public.locations l
  left join public.businesses b
    on b.id=coalesce(l.claimed_business_id,l.business_id)
  where l.is_active=true
    and l.verification_status='verified'::public.verification_status
    and l.bathroom_verification_status in ('has_bathroom','verified')
)
select
  id,
  name,
  coalesce(claimed_business_id,business_id) as business_id,
  business_name,
  address,
  city,
  state,
  postal_code,
  country,
  latitude,
  longitude,
  place_type,
  phone,
  website,
  description,
  verification_status,
  is_premium,
  accessible,
  changing_table,
  cleanliness,
  cleanliness_pct,
  rating,
  review_count,
  cleaning_schedule,
  smart_bathroom,
  bathroom_verification_status,
  bathroom_verified_at,
  bathroom_verification_count,
  bathroom_positive_count,
  bathroom_negative_count,
  source,
  source_dataset,
  source_external_id,
  jsonb_strip_nulls(jsonb_build_object(
    'provider',source_metadata->'provider',
    'market_key',source_metadata->'market_key',
    'captured_at',source_metadata->'captured_at',
    'source_dataset',source_metadata->'source_dataset',
    'source_category',source_metadata->'source_category',
    'publisher',source_metadata->'publisher',
    'source_confidence',source_metadata->'source_confidence',
    'dataset',source_metadata->'dataset',
    'catalog_dataset_id',source_metadata->'catalog_dataset_id',
    'tags',public_osm_tags
  )) as source_metadata,
  public_osm_tags as osm_tags
from src;

revoke all on public.public_locations from public;
grant select on public.public_locations to anon, authenticated, service_role;

create or replace function public.mobile_location_detail_v1(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with base as (
  select
    l.*,
    coalesce(l.claimed_business_id,l.business_id) as effective_business_id,
    jsonb_strip_nulls(jsonb_build_object(
      'amenity', l.source_metadata #> '{tags,amenity}',
      'toilets', l.source_metadata #> '{tags,toilets}',
      'toilets:access', l.source_metadata #> '{tags,toilets:access}',
      'toilets:wheelchair', l.source_metadata #> '{tags,toilets:wheelchair}',
      'wheelchair', l.source_metadata #> '{tags,wheelchair}',
      'changing_table', l.source_metadata #> '{tags,changing_table}',
      'opening_hours', l.source_metadata #> '{tags,opening_hours}',
      'brand', l.source_metadata #> '{tags,brand}',
      'operator', l.source_metadata #> '{tags,operator}',
      'shop', l.source_metadata #> '{tags,shop}',
      'leisure', l.source_metadata #> '{tags,leisure}',
      'tourism', l.source_metadata #> '{tags,tourism}',
      'building', l.source_metadata #> '{tags,building}',
      'internet_access', l.source_metadata #> '{tags,internet_access}',
      'drinking_water', l.source_metadata #> '{tags,drinking_water}',
      'shower', l.source_metadata #> '{tags,shower}',
      'handwashing', l.source_metadata #> '{tags,handwashing}',
      'seats', l.source_metadata #> '{tags,seats}'
    )) as public_osm_tags
  from public.locations l
  where l.id=p_location_id and l.is_active=true
)
select jsonb_build_object(
  'id',l.id,
  'business_id',l.effective_business_id,
  'name',l.name,
  'address',l.address,
  'city',l.city,
  'state',l.state,
  'postal_code',l.postal_code,
  'country',l.country,
  'latitude',l.latitude,
  'longitude',l.longitude,
  'place_type',l.place_type,
  'phone',l.phone,
  'website',l.website,
  'description',l.description,
  'verification_status',l.verification_status,
  'source',l.source,
  'source_dataset',l.source_dataset,
  'source_external_id',l.source_external_id,
  'source_metadata',jsonb_strip_nulls(jsonb_build_object(
    'provider',l.source_metadata->'provider',
    'market_key',l.source_metadata->'market_key',
    'captured_at',l.source_metadata->'captured_at',
    'source_dataset',l.source_metadata->'source_dataset',
    'source_category',l.source_metadata->'source_category',
    'publisher',l.source_metadata->'publisher',
    'source_confidence',l.source_metadata->'source_confidence',
    'dataset',l.source_metadata->'dataset',
    'catalog_dataset_id',l.source_metadata->'catalog_dataset_id',
    'tags',l.public_osm_tags
  )),
  'is_premium',l.is_premium,
  'is_active',l.is_active,
  'accessible',l.accessible,
  'changing_table',l.changing_table,
  'cleanliness',l.cleanliness,
  'cleanliness_pct',l.cleanliness_pct,
  'rating',l.rating,
  'review_count',l.review_count,
  'cleaning_schedule',l.cleaning_schedule,
  'smart_bathroom',l.smart_bathroom,
  'geofence_radius_m',l.geofence_radius_m,
  'promo_offer',l.promo_offer,
  'bathroom_verification_status',l.bathroom_verification_status,
  'bathroom_verified_at',l.bathroom_verified_at,
  'bathroom_verification_count',l.bathroom_verification_count,
  'bathroom_positive_count',l.bathroom_positive_count,
  'bathroom_negative_count',l.bathroom_negative_count,
  'bathroom_verification_source',l.bathroom_verification_source,
  'verification_observation_count',l.verification_observation_count,
  'verification_positive_count',l.verification_positive_count,
  'verification_negative_count',l.verification_negative_count,
  'verification_confidence',l.verification_confidence,

  'business',case when b.id is null then null else jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'description',b.description,
    'website',b.website,
    'phone',b.phone,
    'logo_url',b.logo_url,
    'verification_status',b.verification_status
  ) end,

  'business_name',b.name,
  'business_logo_url',b.logo_url,

  'hours',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,
      'location_id',h.location_id,
      'day_of_week',h.day_of_week,
      'opens_at',h.opens_at,
      'closes_at',h.closes_at,
      'is_24_hours',h.is_24_hours,
      'notes',h.notes
    ) order by h.day_of_week)
    from public.location_hours h
    where h.location_id=l.id
  ),'[]'::jsonb),

  'intelligence',(
    select jsonb_build_object(
      'location_id',i.location_id,
      'status',i.status,
      'access',i.access,
      'confidence',i.confidence,
      'evidence_count',i.evidence_count,
      'explicit_positive',i.explicit_positive,
      'explicit_negative',i.explicit_negative,
      'freshness_score',i.freshness_score,
      'computed_at',i.computed_at
    )
    from public.location_bathroom_intelligence i
    where i.location_id=l.id
  ),

  'feature_summary',(
    select jsonb_build_object(
      'location_id',f.location_id,
      'verification_score',f.verification_score,
      'confidence_score',f.confidence_score,
      'cleanliness_score',f.cleanliness_score,
      'accessibility_score',f.accessibility_score,
      'safety_score',f.safety_score,
      'overall_rating',f.overall_rating,
      'rating_count',f.rating_count,
      'review_count',f.review_count,
      'check_in_count',f.check_in_count,
      'qr_check_in_count',f.qr_check_in_count,
      'photo_count',f.photo_count,
      'amenity_observation_count',f.amenity_observation_count,
      'favorite_count',f.favorite_count,
      'route_count',f.route_count,
      'last_verified_at',f.last_verified_at
    )
    from public.location_feature_summary f
    where f.location_id=l.id
  ),

  'promotions',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,
      'business_id',p.business_id,
      'location_id',p.location_id,
      'title',p.title,
      'description',p.description,
      'discount',p.discount,
      'starts_at',p.starts_at,
      'ends_at',p.ends_at,
      'days_of_week',p.days_of_week,
      'start_hour',p.start_hour,
      'end_hour',p.end_hour,
      'active',p.active,
      'created_at',p.created_at
    ) order by p.starts_at desc)
    from public.promotions p
    where p.location_id=l.id
      and p.active=true
      and (p.ends_at is null or p.ends_at>=now())
  ),'[]'::jsonb),

  'photos',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',ph.id,
      'location_id',ph.location_id,
      'storage_path',ph.storage_path,
      'caption',ph.caption,
      'media_type',ph.media_type,
      'mime_type',ph.mime_type,
      'width',ph.width,
      'height',ph.height,
      'sort_order',ph.sort_order,
      'is_featured',ph.is_featured,
      'created_at',ph.created_at
    ) order by ph.is_featured desc,ph.sort_order,ph.created_at desc)
    from public.location_photos ph
    where ph.location_id=l.id
  ),'[]'::jsonb)
)
from base l
left join public.businesses b on b.id=l.effective_business_id;
$function$;

revoke all on function public.mobile_location_detail_v1(uuid) from public;
grant execute on function public.mobile_location_detail_v1(uuid) to anon, authenticated, service_role;

create or replace function public.get_location_details(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
select jsonb_build_object(
  'location',jsonb_build_object(
    'id',l.id,
    'business_id',coalesce(l.claimed_business_id,l.business_id),
    'name',l.name,
    'address',l.address,
    'city',l.city,
    'state',l.state,
    'postal_code',l.postal_code,
    'country',l.country,
    'latitude',l.latitude,
    'longitude',l.longitude,
    'place_type',l.place_type,
    'phone',l.phone,
    'website',l.website,
    'description',l.description,
    'is_active',l.is_active,
    'accessible',l.accessible,
    'changing_table',l.changing_table,
    'cleanliness',l.cleanliness,
    'cleanliness_pct',l.cleanliness_pct,
    'rating',l.rating,
    'review_count',l.review_count,
    'smart_bathroom',l.smart_bathroom,
    'promo_offer',l.promo_offer,
    'bathroom_verification_status',l.bathroom_verification_status,
    'bathroom_verified_at',l.bathroom_verified_at,
    'bathroom_verification_count',l.bathroom_verification_count,
    'bathroom_positive_count',l.bathroom_positive_count,
    'bathroom_negative_count',l.bathroom_negative_count,
    'bathroom_verification_source',l.bathroom_verification_source,
    'source',l.source,
    'source_dataset',l.source_dataset,
    'source_external_id',l.source_external_id,
    'source_metadata',jsonb_strip_nulls(jsonb_build_object(
      'provider',l.source_metadata->'provider',
      'market_key',l.source_metadata->'market_key',
      'captured_at',l.source_metadata->'captured_at',
      'source_dataset',l.source_metadata->'source_dataset',
      'source_category',l.source_metadata->'source_category',
      'publisher',l.source_metadata->'publisher',
      'source_confidence',l.source_metadata->'source_confidence',
      'dataset',l.source_metadata->'dataset',
      'catalog_dataset_id',l.source_metadata->'catalog_dataset_id'
    )),
    'verification_observation_count',l.verification_observation_count,
    'verification_positive_count',l.verification_positive_count,
    'verification_negative_count',l.verification_negative_count,
    'verification_confidence',l.verification_confidence
  ),
  'business',case when b.id is null then null else jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'description',b.description,
    'website',b.website,
    'phone',b.phone,
    'logo_url',b.logo_url,
    'verification_status',b.verification_status
  ) end,
  'amenities',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,
      'name',a.name,
      'category',a.category
    ) order by a.category,a.name)
    from public.location_amenities la
    join public.amenities a on a.id=la.amenity_id
    where la.location_id=l.id
  ),'[]'::jsonb),
  'promotions',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,
      'business_id',p.business_id,
      'location_id',p.location_id,
      'title',p.title,
      'description',p.description,
      'discount',p.discount,
      'starts_at',p.starts_at,
      'ends_at',p.ends_at,
      'days_of_week',p.days_of_week,
      'start_hour',p.start_hour,
      'end_hour',p.end_hour,
      'active',p.active,
      'created_at',p.created_at
    ) order by p.starts_at nulls last,p.title)
    from public.promotions p
    where p.location_id=l.id
      and coalesce(p.active,true)
      and (p.ends_at is null or p.ends_at>=now())
  ),'[]'::jsonb),
  'events',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',e.id,
      'business_id',e.business_id,
      'location_id',e.location_id,
      'title',e.title,
      'description',e.description,
      'event_date',e.event_date,
      'event_time',e.event_time,
      'status',e.status,
      'created_at',e.created_at
    ) order by e.event_date,e.event_time)
    from public.business_events e
    where e.location_id=l.id
      and e.event_date>=current_date
      and coalesce(e.status,'scheduled') in ('scheduled','active')
  ),'[]'::jsonb),
  'osm_tags',jsonb_strip_nulls(jsonb_build_object(
    'amenity', l.source_metadata #> '{tags,amenity}',
    'toilets', l.source_metadata #> '{tags,toilets}',
    'toilets:access', l.source_metadata #> '{tags,toilets:access}',
    'toilets:wheelchair', l.source_metadata #> '{tags,toilets:wheelchair}',
    'wheelchair', l.source_metadata #> '{tags,wheelchair}',
    'changing_table', l.source_metadata #> '{tags,changing_table}',
    'opening_hours', l.source_metadata #> '{tags,opening_hours}',
    'brand', l.source_metadata #> '{tags,brand}',
    'operator', l.source_metadata #> '{tags,operator}'
  )),
  'verification',jsonb_build_object(
    'status',coalesce(l.bathroom_verification_status,'unverified'),
    'verified',coalesce(l.bathroom_verification_status,'unverified') in ('has_bathroom','verified'),
    'verified_at',l.bathroom_verified_at,
    'source',l.bathroom_verification_source
  )
)
from public.locations l
left join public.businesses b on b.id=coalesce(l.claimed_business_id,l.business_id)
where l.id=p_location_id
  and l.is_active=true;
$function$;

revoke all on function public.get_location_details(uuid) from public, anon;
grant execute on function public.get_location_details(uuid) to authenticated, service_role;
