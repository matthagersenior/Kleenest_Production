
revoke select on table public.locations from anon,authenticated;

grant select(
  id,business_id,name,address,city,state,postal_code,country,
  latitude,longitude,place_type,phone,website,description,
  verification_status,source,is_premium,is_active,accessible,changing_table,
  cleanliness,cleanliness_pct,rating,review_count,cleaning_schedule,smart_bathroom,
  promo_offer,created_at,updated_at,bathroom_verification_status,bathroom_verified_at,
  bathroom_verification_count,bathroom_positive_count,bathroom_negative_count,
  bathroom_verification_source,source_dataset,source_external_id,claimed_business_id,
  verification_observation_count,verification_positive_count,verification_negative_count,
  verification_confidence
) on table public.locations to anon,authenticated;

create or replace function public.business_list_locations(p_business_id uuid)
returns setof public.locations
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  return query
  select (
    pg_catalog.jsonb_populate_record(
      null::public.locations,
      (
        to_jsonb(l)
        - array[
          'geom','owner_name','owner_email','created_by',
          'bathroom_verified_by','source_metadata'
        ]::text[]
      )
      || jsonb_build_object(
        'source_metadata',
        jsonb_strip_nulls(jsonb_build_object(
          'provenance',jsonb_build_object(
            'source',l.source,
            'source_dataset',l.source_dataset,
            'source_external_id',l.source_external_id
          ),
          'tags',jsonb_strip_nulls(jsonb_build_object(
            'amenity',l.source_metadata #> '{tags,amenity}',
            'toilets',l.source_metadata #> '{tags,toilets}',
            'toilets:access',l.source_metadata #> '{tags,toilets:access}',
            'toilets:wheelchair',l.source_metadata #> '{tags,toilets:wheelchair}',
            'wheelchair',l.source_metadata #> '{tags,wheelchair}',
            'changing_table',l.source_metadata #> '{tags,changing_table}',
            'opening_hours',l.source_metadata #> '{tags,opening_hours}',
            'brand',l.source_metadata #> '{tags,brand}',
            'operator',l.source_metadata #> '{tags,operator}'
          ))
        ))
      )
    )
  ).*
  from public.locations l
  where coalesce(l.business_id,l.claimed_business_id)=p_business_id
     or l.business_id=p_business_id
     or l.claimed_business_id=p_business_id
     or exists(
       select 1
       from public.location_claims c
       where c.location_id=l.id
         and c.business_id=p_business_id
         and c.status='approved'
     )
  order by l.created_at asc;
end;
$$;

create or replace function public.business_operations_inventory(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  return jsonb_build_object(
    'business_id',p_business_id,
    'advanced_allowed',public.business_advanced_allowed(p_business_id),

    'locations',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
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
        'verification_status',l.verification_status,
        'is_active',l.is_active,
        'accessible',l.accessible,
        'changing_table',l.changing_table,
        'cleanliness',l.cleanliness,
        'cleanliness_pct',l.cleanliness_pct,
        'rating',l.rating,
        'review_count',l.review_count,
        'cleaning_schedule',l.cleaning_schedule,
        'smart_bathroom',l.smart_bathroom,
        'promo_offer',l.promo_offer,
        'bathroom_verification_status',l.bathroom_verification_status,
        'bathroom_verified_at',l.bathroom_verified_at,
        'bathroom_verification_count',l.bathroom_verification_count,
        'verification_confidence',l.verification_confidence
      )) order by l.created_at desc)
      from public.locations l
      where coalesce(l.claimed_business_id,l.business_id)=p_business_id
    ),'[]'::jsonb),

    'promotions',coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.promotions p
      where p.business_id=p_business_id
    ),'[]'::jsonb),

    'campaigns',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from public.enterprise_partner_campaigns c
      join public.enterprise_partner_networks n on n.id=c.network_id
      where n.owner_business_id=p_business_id
    ),'[]'::jsonb),

    'events',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.event_date desc nulls last,e.event_time desc nulls last,e.created_at desc)
      from public.business_events e
      where e.business_id=p_business_id
    ),'[]'::jsonb),

    'qr_codes',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.created_at desc)
      from public.qr_codes q
      where q.business_id=p_business_id
         or q.location_id in(
           select l.id
           from public.locations l
           where coalesce(l.claimed_business_id,l.business_id)=p_business_id
         )
    ),'[]'::jsonb),

    'reviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'location_id',r.location_id,
        'stars',r.stars,
        'cleanliness_pct',r.cleanliness_pct,
        'comment',r.comment,
        'status',r.status,
        'business_reply',r.business_reply,
        'business_replied_at',r.business_replied_at,
        'created_at',r.created_at,
        'updated_at',r.updated_at
      ) order by r.created_at desc)
      from public.reviews r
      where r.location_id in(
        select l.id
        from public.locations l
        where coalesce(l.claimed_business_id,l.business_id)=p_business_id
      )
    ),'[]'::jsonb),

    'contests',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.starts_at desc nulls last,c.created_at desc)
      from public.contests c
      where c.business_id=p_business_id
    ),'[]'::jsonb),

    'media',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'location_id',p.location_id,
        'storage_path',p.storage_path,
        'caption',p.caption,
        'media_type',p.media_type,
        'mime_type',p.mime_type,
        'size_bytes',p.size_bytes,
        'width',p.width,
        'height',p.height,
        'sort_order',p.sort_order,
        'is_featured',p.is_featured,
        'moderation_status',p.moderation_status,
        'created_at',p.created_at,
        'location_name',l.name
      ) order by p.created_at desc)
      from public.location_photos p
      join public.locations l on l.id=p.location_id
      where coalesce(l.claimed_business_id,l.business_id)=p_business_id
        and p.origin='business'
        and p.business_id=p_business_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.business_list_locations(uuid) from public,anon;
revoke all on function public.business_operations_inventory(uuid) from public,anon;
grant execute on function public.business_list_locations(uuid) to authenticated,service_role;
grant execute on function public.business_operations_inventory(uuid) to authenticated,service_role;
