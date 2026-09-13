
create or replace function public.get_location_authority_bundle(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_requested_id uuid:=p_location_id;
  v_location_id uuid:=p_location_id;
  v_location jsonb;
  v_place jsonb;
  v_intelligence jsonb;
  v_trust jsonb;
  v_reviews jsonb;
  v_external jsonb;
  v_interactions jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_requested_id is null then
    raise exception 'Canonical location is required.' using errcode='22023';
  end if;

  select
    p.location_id,
    jsonb_build_object(
      'id',p.id,
      'location_id',p.location_id,
      'name',p.name,
      'slug',p.slug,
      'category',p.category,
      'description',p.description,
      'address',p.address,
      'city',p.city,
      'state',p.state,
      'postal_code',p.postal_code,
      'latitude',p.latitude,
      'longitude',p.longitude,
      'rating',p.rating,
      'review_count',p.review_count,
      'is_active',p.is_active,
      'is_verified',p.is_verified,
      'created_at',p.created_at,
      'updated_at',p.updated_at
    )
  into v_location_id,v_place
  from public.places p
  where p.id=v_requested_id and p.is_active=true
  limit 1;

  if v_location_id is null then
    v_location_id:=v_requested_id;
    select jsonb_build_object(
      'id',p.id,
      'location_id',p.location_id,
      'name',p.name,
      'slug',p.slug,
      'category',p.category,
      'description',p.description,
      'address',p.address,
      'city',p.city,
      'state',p.state,
      'postal_code',p.postal_code,
      'latitude',p.latitude,
      'longitude',p.longitude,
      'rating',p.rating,
      'review_count',p.review_count,
      'is_active',p.is_active,
      'is_verified',p.is_verified,
      'created_at',p.created_at,
      'updated_at',p.updated_at
    )
    into v_place
    from public.places p
    where p.location_id=v_location_id and p.is_active=true
    order by p.updated_at desc nulls last
    limit 1;
  end if;

  v_location:=public.mobile_location_detail_v1(v_location_id)
    - array['business','photos','promotions','intelligence','feature_summary','hours']::text[];

  if v_location is null or v_location='null'::jsonb then
    return jsonb_build_object(
      'location',null,
      'place',v_place,
      'intelligence',null,
      'trust',null,
      'reviews','[]'::jsonb,
      'external_records','[]'::jsonb,
      'interaction',jsonb_build_object(
        'favorited',false,
        'checked_in',false,
        'latest_check_in',null
      ),
      'schema_version',1
    );
  end if;

  select jsonb_build_object(
    'place_id',s.place_id,
    'location_id',s.location_id,
    'name',s.name,
    'category',s.category,
    'latitude',s.latitude,
    'longitude',s.longitude,
    'intelligence_score',s.intelligence_score,
    'freshness_label',s.freshness_label,
    'last_observed_at',s.last_observed_at,
    'cleanliness_pct',s.cleanliness_pct,
    'verification_count',s.verification_count,
    'observation_count',s.observation_count,
    'searches_7d',s.searches_7d,
    'searches_30d',s.searches_30d,
    'views_30d',s.views_30d,
    'directions_30d',s.directions_30d,
    'arrivals_30d',s.arrivals_30d,
    'checkins_30d',s.checkins_30d,
    'reviews_30d',s.reviews_30d,
    'calculated_at',s.calculated_at,
    'check_in_count',s.check_in_count
  )
  into v_intelligence
  from public.location_intelligence_snapshot s
  where s.location_id=v_location_id
  order by s.calculated_at desc nulls last
  limit 1;

  begin
    v_trust:=public.get_location_trust_state(v_location_id);
  exception when others then
    v_trust:=null;
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'review',jsonb_build_object(
          'id',r.id,
          'location_id',r.location_id,
          'stars',r.stars,
          'cleanliness_pct',r.cleanliness_pct,
          'comment',r.comment,
          'status',r.status::text,
          'business_reply',r.business_reply,
          'business_replied_at',r.business_replied_at,
          'created_at',r.created_at,
          'updated_at',r.updated_at
        ),
        'profile',(
          select jsonb_build_object(
            'display_name',pf.display_name,
            'username',pf.username,
            'avatar_url',pf.avatar_url,
            'bio',pf.bio
          )
          from public.profiles pf
          where pf.id=r.user_id
          limit 1
        ),
        'reputation',(
          select jsonb_build_object(
            'observations_count',cr.observations_count,
            'verified_checkins_count',cr.verified_checkins_count,
            'confirmed_observations_count',cr.confirmed_observations_count,
            'reputation_score',cr.reputation_score,
            'verification_level',cr.verification_level,
            'last_activity_at',cr.last_activity_at
          )
          from public.contributor_reputation cr
          where cr.user_id=r.user_id
          limit 1
        ),
        'photos',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id',rp.id,
              'review_id',rp.review_id,
              'storage_path',rp.storage_path,
              'created_at',rp.created_at,
              'mime_type',rp.mime_type,
              'width',rp.width,
              'height',rp.height,
              'sort_order',rp.sort_order
            )
            order by rp.sort_order,rp.created_at
          )
          from public.review_photos rp
          where rp.review_id=r.id
            and rp.moderation_status='visible'
        ),'[]'::jsonb)
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_reviews
  from public.reviews r
  where r.location_id=v_location_id
    and r.status::text='published';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'record_type',e.record_type,
        'name',e.name,
        'first_seen_at',e.first_seen_at,
        'last_seen_at',e.last_seen_at,
        'source_updated_at',e.source_updated_at,
        'active',e.active
      )
      order by e.last_seen_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_external
  from public.external_location_records e
  where e.location_id=v_location_id
    and coalesce(e.active,true);

  select jsonb_build_object(
    'favorited',exists(
      select 1 from public.favorites f
      where f.user_id=auth.uid() and f.location_id=v_location_id
    ),
    'checked_in',exists(
      select 1 from public.check_ins c
      where c.user_id=auth.uid() and c.location_id=v_location_id
    ),
    'latest_check_in',(
      select jsonb_build_object(
        'id',c.id,
        'location_id',c.location_id,
        'qr_code_id',c.qr_code_id,
        'checked_in_at',c.checked_in_at,
        'distance_meters',c.distance_meters,
        'verification_method',c.verification_method,
        'points_awarded',c.points_awarded
      )
      from public.check_ins c
      where c.user_id=auth.uid() and c.location_id=v_location_id
      order by c.checked_in_at desc nulls last
      limit 1
    )
  )
  into v_interactions;

  return jsonb_build_object(
    'location',v_location,
    'place',v_place,
    'intelligence',coalesce(v_intelligence,'{}'::jsonb),
    'trust',v_trust,
    'reviews',v_reviews,
    'external_records',v_external,
    'interaction',v_interactions,
    'schema_version',1
  );
end;
$$;

revoke all on function public.get_location_authority_bundle(uuid) from public,anon;
grant execute on function public.get_location_authority_bundle(uuid) to authenticated,service_role;
