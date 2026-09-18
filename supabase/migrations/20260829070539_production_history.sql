create or replace view public.place_experience_projection as
select l.id as location_id,l.name,l.address,l.city,l.state,l.postal_code,l.latitude,l.longitude,l.place_type,l.business_id,l.rating,l.review_count,(l.verification_status::text in ('verified','approved')) as is_verified,l.is_premium,l.is_active,l.promo_offer,l.accessible,l.changing_table,l.cleanliness,l.cleanliness_pct,l.bathroom_verification_status,l.bathroom_verified_at,l.bathroom_verification_count,l.source,l.source_dataset,l.source_external_id,
 b.name as business_name,b.logo_url as business_logo_url,
 lc.score as confidence_score,lc.freshness_score,lc.staleness_status,lc.last_verified_at,
 (select lp.storage_path from public.location_photos lp where lp.location_id=l.id and lp.is_featured=true order by lp.sort_order asc,lp.created_at desc limit 1) as featured_photo_path,
 (select count(*) from public.location_photos lp where lp.location_id=l.id) as photo_count,
 (select count(*) from public.reviews r where r.location_id=l.id and r.status::text in ('published','approved')) as live_review_count,
 (select count(*) from public.promotions p where p.location_id=l.id and p.active=true and (p.starts_at is null or p.starts_at<=now()) and (p.ends_at is null or p.ends_at>=now())) as active_promotion_count,
 (select count(*) from public.business_campaigns c where c.location_id=l.id and c.status='active' and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now())) as active_campaign_count,
 (select count(*) from public.business_events e where e.location_id=l.id and e.status='active' and e.event_date>=current_date) as upcoming_event_count,
 (select count(*) from public.quests q where q.owner_id=coalesce(l.business_id,l.id) and q.status='active' and (q.start_at is null or q.start_at<=now()) and (q.end_at is null or q.end_at>=now())) as active_quest_count
from public.locations l
left join public.businesses b on b.id=l.business_id
left join public.location_confidence lc on lc.location_id=l.id
where coalesce(l.is_active,true)=true;
