create or replace function public.get_location_details(p_location_id uuid)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'location', to_jsonb(l),
    'business', case when b.id is null then null else to_jsonb(b) end,
    'amenities', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'category',a.category) order by a.category,a.name) from public.location_amenities la join public.amenities a on a.id=la.amenity_id where la.location_id=l.id),'[]'::jsonb),
    'promotions', coalesce((select jsonb_agg(to_jsonb(p) order by p.starts_at nulls last,p.title) from public.promotions p where p.location_id=l.id and coalesce(p.active,true) and (p.ends_at is null or p.ends_at>=now())),'[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_date,e.event_time) from public.business_events e where e.location_id=l.id and e.event_date>=current_date),'[]'::jsonb),
    'osm_tags', coalesce(l.source_metadata->'tags','{}'::jsonb),
    'verification', jsonb_build_object('status',coalesce(l.bathroom_verification_status,'unverified'),'verified',coalesce(l.bathroom_verification_status,'unverified') in ('has_bathroom','verified'),'verified_at',l.bathroom_verified_at,'source',l.bathroom_verification_source)
  )
  from public.locations l left join public.businesses b on b.id=l.business_id where l.id=p_location_id;
$$;

create or replace function public.get_location_bathroom_verification(p_location_id uuid)
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('status',coalesce(l.bathroom_verification_status,'unverified'),'verified',coalesce(l.bathroom_verification_status,'unverified') in ('has_bathroom','verified'),'verified_at',l.bathroom_verified_at,'source',l.bathroom_verification_source) from public.locations l where l.id=p_location_id;
$$;

create or replace view public.public_locations as
select l.id,l.name,l.business_id,b.name as business_name,l.address,l.city,l.state,l.postal_code,l.country,l.latitude,l.longitude,l.place_type,l.phone,l.website,l.description,l.verification_status,l.is_premium,l.accessible,l.changing_table,l.cleanliness,l.cleanliness_pct,l.rating,l.review_count,l.cleaning_schedule,l.smart_bathroom,l.bathroom_verification_status,l.bathroom_verified_at,l.bathroom_verification_count,l.bathroom_positive_count,l.bathroom_negative_count,l.source,l.source_dataset,l.source_external_id,l.source_metadata,
 case when l.source_metadata ? 'tags' then l.source_metadata->'tags' else '{}'::jsonb end as osm_tags
from public.locations l left join public.businesses b on b.id=l.business_id where l.is_active=true and l.verification_status='verified'::verification_status and l.bathroom_verification_status in ('has_bathroom','verified');
