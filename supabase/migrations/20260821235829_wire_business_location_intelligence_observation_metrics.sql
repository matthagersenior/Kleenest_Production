create or replace function public.business_location_intelligence(p_business_id uuid, p_start timestamptz default now()-interval '30 days', p_end timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id)
     and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='analyst')
  then raise exception 'Not authorized for this business'; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'location_id',x.location_id,
        'place_id',x.place_id,
        'name',x.name,
        'category',x.category,
        'intelligence_score',x.intelligence_score,
        'cleanliness_pct',x.cleanliness_pct,
        'verification_count',x.verification_count,
        'observation_count',x.observation_count,
        'observations',x.observations,
        'searches',x.searches,
        'views',x.views,
        'directions',x.directions,
        'arrivals',x.arrivals,
        'check_ins',x.check_ins,
        'reviews',x.reviews,
        'demand_signal',x.demand_signal,
        'freshness_label',x.freshness_label
      ) order by x.searches desc,x.check_ins desc,x.name
    )
    from (
      select s.*,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='search' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) searches,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='location_view' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) views,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='directions_requested' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) directions,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='arrival' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) arrivals,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='check_in' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) check_ins,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='review_submitted' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) reviews,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='observation' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) observations,
        coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='search' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0)
          + 2*coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='location_view' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0)
          + 3*coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='directions_requested' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0)
          + 4*coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='arrival' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0)
          + 5*coalesce((select count(*) from public.data_feature_events e where e.location_id=s.location_id and e.event_type='check_in' and e.occurred_at between p_start and p_end and e.event_validity='valid'),0) demand_signal
      from public.location_intelligence_snapshot s
      join public.locations l on l.id=s.location_id
      where l.business_id=p_business_id
    ) x
  ),'[]'::jsonb);
end;
$function$;
