
create or replace function public.refresh_location_feature_summary(p_location_id uuid default null)
returns void
language plpgsql
set search_path = 'public','pg_temp'
as $$
begin
  insert into public.location_feature_summary(
    location_id,verification_score,confidence_score,cleanliness_score,accessibility_score,safety_score,
    overall_rating,rating_count,review_count,check_in_count,qr_check_in_count,photo_count,
    amenity_observation_count,favorite_count,last_verified_at,feature_vector,updated_at
  )
  select
    l.id,
    least(100,coalesce(100.0*count(distinct bv.id)/greatest(1,count(distinct bv.id)+2),0)),
    least(100,coalesce(100.0*(count(distinct bv.id)+count(distinct ao.id))/greatest(1,count(distinct bv.id)+count(distinct ao.id)+2),0)),
    avg(q.cleanliness_score),
    avg(q.accessibility_score),
    avg(q.safety_score),
    avg(coalesce(q.overall_stars,r.stars)),
    count(distinct coalesce(q.id,r.id)),
    count(distinct r.id),
    count(distinct ci.id),
    count(distinct case when ci.qr_code_id is not null then ci.id end),
    count(distinct lp.id),
    count(distinct ao.id),
    count(distinct f.id),
    max(bv.created_at),
    jsonb_build_object(
      'amenities',count(distinct ao.amenity_id),
      'photos',count(distinct lp.id),
      'reviews',count(distinct r.id)
    ),
    now()
  from public.locations l
  left join public.location_bathroom_verifications bv on bv.location_id=l.id
  left join public.location_amenity_observations ao on ao.location_id=l.id
  left join public.location_quality_observations q on q.location_id=l.id
  left join public.reviews r on r.location_id=l.id and r.status::text not in ('rejected','removed')
  left join public.check_ins ci on ci.location_id=l.id
  left join public.location_photos lp
    on lp.location_id=l.id
   and lp.moderation_status='visible'
  left join public.location_favorites f on f.location_id=l.id
  where p_location_id is null or l.id=p_location_id
  group by l.id
  on conflict(location_id) do update set
    verification_score=excluded.verification_score,
    confidence_score=excluded.confidence_score,
    cleanliness_score=excluded.cleanliness_score,
    accessibility_score=excluded.accessibility_score,
    safety_score=excluded.safety_score,
    overall_rating=excluded.overall_rating,
    rating_count=excluded.rating_count,
    review_count=excluded.review_count,
    check_in_count=excluded.check_in_count,
    qr_check_in_count=excluded.qr_check_in_count,
    photo_count=excluded.photo_count,
    amenity_observation_count=excluded.amenity_observation_count,
    favorite_count=excluded.favorite_count,
    last_verified_at=excluded.last_verified_at,
    feature_vector=excluded.feature_vector,
    updated_at=now();
end;
$$;

revoke all on function public.refresh_location_feature_summary(uuid) from public, anon, authenticated;
grant execute on function public.refresh_location_feature_summary(uuid) to service_role;

revoke all on function public.business_manage_contest(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.business_manage_contest(uuid,uuid,text,jsonb) to authenticated, service_role;

revoke all on function public.send_prioritized_notification(text,uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.send_prioritized_notification(text,uuid,text,text,text,text,jsonb) to authenticated, service_role;
