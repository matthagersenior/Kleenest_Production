create table if not exists public.external_observation_live_summary (
  location_id uuid primary key references public.locations(id) on delete cascade,
  observation_count integer not null default 0,
  last_observed_at timestamptz,
  toilets_positive integer not null default 0,
  toilets_negative integer not null default 0,
  toilets_access_customers integer not null default 0,
  toilets_access_permissive integer not null default 0,
  toilets_access_public integer not null default 0,
  recent_positive_count integer not null default 0,
  recent_negative_count integer not null default 0,
  weighted_observation_count numeric not null default 0,
  weighted_positive_count numeric not null default 0,
  weighted_negative_count numeric not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.external_observation_live_summary(
  location_id,observation_count,last_observed_at,toilets_positive,toilets_negative,
  toilets_access_customers,toilets_access_permissive,toilets_access_public,
  recent_positive_count,recent_negative_count,weighted_observation_count,
  weighted_positive_count,weighted_negative_count,updated_at)
select eo.location_id,
       count(*)::int,
       max(eo.observed_at),
       count(*) filter(where lower(coalesce(eo.attribute_key,'')) like '%toilets%' and lower(coalesce(eo.value_text,'')) in('yes','true','1','vault'))::int,
       count(*) filter(where lower(coalesce(eo.attribute_key,'')) like '%toilets%' and lower(coalesce(eo.value_text,'')) in('no','false','0'))::int,
       count(*) filter(where lower(coalesce(eo.attribute_key,'')) like '%toilets:access%' and lower(coalesce(eo.value_text,''))='customers')::int,
       count(*) filter(where lower(coalesce(eo.attribute_key,'')) like '%toilets:access%' and lower(coalesce(eo.value_text,''))='permissive')::int,
       count(*) filter(where lower(coalesce(eo.attribute_key,'')) like '%toilets:access%' and lower(coalesce(eo.value_text,''))='yes')::int,
       count(*) filter(where eo.observed_at >= now()-interval '30 days' and lower(coalesce(eo.value_text,'')) in('clean','supplies_stocked','open'))::int,
       count(*) filter(where eo.observed_at >= now()-interval '30 days' and lower(coalesce(eo.value_text,'')) in('needs_cleaning','supplies_low','closed_unavailable'))::int,
       coalesce(sum(case when eo.observed_at >= now()-interval '30 days' then coalesce(eo.confidence,1) else 0 end),0),
       coalesce(sum(case when eo.observed_at >= now()-interval '30 days' and lower(coalesce(eo.value_text,'')) in('clean','supplies_stocked','open') then coalesce(eo.confidence,1) else 0 end),0),
       coalesce(sum(case when eo.observed_at >= now()-interval '30 days' and lower(coalesce(eo.value_text,'')) in('needs_cleaning','supplies_low','closed_unavailable') then coalesce(eo.confidence,1) else 0 end),0),
       now()
from public.external_observations eo
where eo.location_id is not null
group by eo.location_id
on conflict(location_id) do update set
  observation_count=excluded.observation_count,
  last_observed_at=excluded.last_observed_at,
  toilets_positive=excluded.toilets_positive,
  toilets_negative=excluded.toilets_negative,
  toilets_access_customers=excluded.toilets_access_customers,
  toilets_access_permissive=excluded.toilets_access_permissive,
  toilets_access_public=excluded.toilets_access_public,
  recent_positive_count=excluded.recent_positive_count,
  recent_negative_count=excluded.recent_negative_count,
  weighted_observation_count=excluded.weighted_observation_count,
  weighted_positive_count=excluded.weighted_positive_count,
  weighted_negative_count=excluded.weighted_negative_count,
  updated_at=now();

create or replace function public.compute_bathroom_intelligence(p_location_id uuid)
 returns public.location_bathroom_intelligence
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_category text; v_positive int:=0; v_negative int:=0; v_customers int:=0; v_permissive int:=0; v_public int:=0; v_community_pos int:=0; v_community_neg int:=0; v_evidence int:=0; v_pos boolean:=false; v_neg boolean:=false; v_access text:='unknown'; v_status text:='unknown'; v_prior numeric:=0; v_source numeric:=0; v_conf numeric:=0; v_fresh numeric:=100; v_row public.location_bathroom_intelligence;
begin
 select lower(coalesce(place_type,'')) into v_category from public.locations where id=p_location_id;
 select coalesce(toilets_positive,0),coalesce(toilets_negative,0),coalesce(toilets_access_customers,0),coalesce(toilets_access_permissive,0),coalesce(toilets_access_public,0)
 into v_positive,v_negative,v_customers,v_permissive,v_public
 from public.external_observation_live_summary where location_id=p_location_id;
 select count(*) filter(where observation_type in('clean','supplies_ok','open','accessible','changing_table','bathroom_present')),count(*) filter(where observation_type in('dirty','supplies_low','closed','not_accessible','no_changing_table','bathroom_missing')),coalesce(extract(epoch from (now()-max(created_at)))/86400,9999) into v_community_pos,v_community_neg,v_fresh from public.restroom_observations where location_id=p_location_id;
 v_evidence:=coalesce(v_positive,0)+coalesce(v_negative,0)+coalesce(v_customers,0)+coalesce(v_permissive,0)+coalesce(v_public,0)+v_community_pos+v_community_neg;
 v_pos:=v_evidence>0 and coalesce(v_positive,0)+coalesce(v_customers,0)+coalesce(v_permissive,0)+coalesce(v_public,0)+v_community_pos>0; v_neg:=coalesce(v_negative,0)+v_community_neg>0;
 v_prior:=case when v_category in('restaurant','gas_station','cafe','shopping','service','health','library','restroom','hotel','bar','fast_food') then 75 when v_category in('park','dog_park','public_safety','transit','travel') then 50 else 25 end;
 v_source:=least(100,v_evidence*12.5); v_fresh:=greatest(0,least(100,100-(v_fresh*3.333333)));
 if v_pos and v_neg then v_status:='uncertain'; elsif v_pos then v_status:='confirmed'; elsif v_neg then v_status:='no_bathroom'; elsif v_prior>=75 then v_status:='likely'; elsif v_prior>=50 then v_status:='uncertain'; end if;
 if coalesce(v_customers,0)>0 then v_access:='customers'; elsif coalesce(v_public,0)>0 then v_access:='public'; elsif coalesce(v_permissive,0)>0 then v_access:='permissive'; elsif v_neg and not v_pos then v_access:='none'; end if;
 v_conf:=case when v_pos and v_neg then 60 when v_pos then least(99,80+v_source*.19) when v_neg then 95 when v_prior>=75 then v_prior else greatest(20,v_prior) end; v_conf:=greatest(0,least(99,v_conf*(0.5+0.5*v_fresh/100)));
 insert into public.location_bathroom_intelligence as bi(location_id,status,access,confidence,evidence_count,explicit_positive,explicit_negative,category_prior,source_score,freshness_score,computed_at,updated_at) values(p_location_id,v_status,v_access,v_conf,v_evidence,v_pos,v_neg,v_prior,v_source,v_fresh,now(),now()) on conflict(location_id) do update set status=excluded.status,access=excluded.access,confidence=excluded.confidence,evidence_count=excluded.evidence_count,explicit_positive=excluded.explicit_positive,explicit_negative=excluded.explicit_negative,category_prior=excluded.category_prior,source_score=excluded.source_score,freshness_score=excluded.freshness_score,computed_at=excluded.computed_at,updated_at=now() returning * into v_row; return v_row;
end
$function$;

create or replace function public.kleenest_location_confidence(p_location_id uuid)
 returns table(score numeric, level text, verification_count integer, source_count integer, review_count integer, factors jsonb)
 language sql stable set search_path to ''
as $function$
  with l as (
    select id, verification_status, bathroom_verification_status,
      coalesce(bathroom_verification_count,0) verification_count,
      coalesce(bathroom_positive_count,0) positive_count,
      coalesce(bathroom_negative_count,0) negative_count,
      coalesce(review_count,0) review_count, rating, updated_at,
      bathroom_verified_at, source, source_dataset
    from public.locations where id=p_location_id
  ), s as (
    select count(*)::int source_count, max(observed_at) evidence_observed_at
    from public.location_sources where location_id=p_location_id
  ), e as (
    select last_observed_at external_observed_at
    from public.external_observation_live_summary
    where location_id=p_location_id
  ), b as (
    select max(created_at) bathroom_observed_at
    from public.location_bathroom_verifications
    where location_id=p_location_id
  ), contradictions as (
    select count(*)::int contradictory_amenity_count
    from (
      select amenity_id from public.location_amenity_observations
      where location_id=p_location_id and observed_at >= now()-interval '180 days' and status in ('present','absent')
      group by amenity_id having bool_or(status='present') and bool_or(status='absent')
    ) x
  ), c as (
    select l.*,s.source_count,
      greatest(s.evidence_observed_at,e.external_observed_at,b.bathroom_observed_at,l.bathroom_verified_at) evidence_fresh_at,
      contradictions.contradictory_amenity_count,
      least(100::numeric,
        20 + case when lower(coalesce(l.bathroom_verification_status,'')) in ('verified','confirmed','has_bathroom') then 35 else 0 end +
        least(20,l.positive_count*4) - least(15,l.negative_count*5) + least(10,l.review_count*1.5) + least(10,s.source_count*3) +
        case when greatest(s.evidence_observed_at,e.external_observed_at,b.bathroom_observed_at,l.bathroom_verified_at) > now()-interval '180 days' then 5 else 0 end
      ) score
    from l cross join s left join e on true cross join b cross join contradictions
  )
  select round(score,2), case when score>=85 then 'trusted' when score>=65 then 'high' when score>=40 then 'moderate' when score>0 then 'low' else 'unknown' end,
    verification_count,source_count,review_count,
    jsonb_build_object('bathroom_status',bathroom_verification_status,'verification_positive',positive_count,'verification_negative',negative_count,'rating',rating,'source',source,'source_dataset',source_dataset,'updated_at',updated_at,'bathroom_verified_at',bathroom_verified_at,'evidence_fresh_at',evidence_fresh_at,'freshness_basis','latest_source_or_external_observation_or_bathroom_verification','contradictory_amenity_count',contradictory_amenity_count,'contradiction_window','180_days','contradiction_policy','present_and_absent_observations_for_same_amenity_within_window_are_exposed_as_conflict_and_do_not_get_silently_collapsed')
  from c;
$function$;

create or replace function public.refresh_location_trust_state(p_location_id uuid)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare c record; v_age_days numeric; v_freshness numeric; v_status text; v_due timestamptz; v_conf numeric; v_last_verified timestamptz;
begin
 if p_location_id is null then raise exception 'location is required'; end if;
 select lc.*,l.id as canonical_id into c from public.locations l left join public.location_confidence lc on lc.location_id=l.id where l.id=p_location_id;
 if not found then raise exception 'location not found'; end if;
 select greatest((select max(observed_at) from public.location_verification_observations where location_id=p_location_id and is_public=true),(select max(created_at) from public.location_bathroom_verifications where location_id=p_location_id),(select max(observed_at) from public.location_quality_observations where location_id=p_location_id),(select max(created_at) from public.restroom_observations where location_id=p_location_id),(select max(checked_in_at) from public.check_ins where location_id=p_location_id and verification_method in ('gps','qr','place')),(select max(observed_at) from public.location_sources where location_id=p_location_id),(select last_observed_at from public.external_observation_live_summary where location_id=p_location_id)) into v_last_verified;
 v_age_days:=case when v_last_verified is null then 9999 else greatest(0,extract(epoch from(now()-v_last_verified))/86400) end;
 v_freshness:=case when v_last_verified is null then 0 when v_age_days<=7 then 100 when v_age_days<=30 then round(100-((v_age_days-7)/23)*20,2) when v_age_days<=90 then round(80-((v_age_days-30)/60)*35,2) when v_age_days<=180 then round(45-((v_age_days-90)/90)*30,2) else greatest(0,round(15-least(15,(v_age_days-180)/30),2)) end;
 v_status:=case when v_last_verified is null then 'unknown' when v_age_days<=7 then 'fresh' when v_age_days<=30 then 'recent' when v_age_days<=90 then 'aging' when v_age_days<=180 then 'stale' else 'very_stale' end;
 v_due:=case when v_last_verified is null then now() else v_last_verified+case when v_status in ('fresh','recent') then interval '30 days' when v_status='aging' then interval '14 days' else interval '3 days' end end;
 v_conf:=coalesce(c.score,0);
 insert into public.location_confidence(location_id,score,level,verification_count,positive_verifications,negative_verifications,source_count,review_count,last_verified_at,computed_at,factors,freshness_score,staleness_status,reverification_due_at,freshness_computed_at) values(p_location_id,v_conf,coalesce(c.level,'unknown'),coalesce(c.verification_count,0),coalesce(c.positive_verifications,0),coalesce(c.negative_verifications,0),coalesce(c.source_count,0),coalesce(c.review_count,0),v_last_verified,now(),coalesce(c.factors,'{}'::jsonb)||jsonb_build_object('freshness_score',v_freshness,'staleness_status',v_status,'reverification_due_at',v_due,'freshness_age_days',v_age_days,'freshness_source','authoritative_verified_evidence_clock'),v_freshness,v_status,v_due,now()) on conflict(location_id) do update set last_verified_at=excluded.last_verified_at,computed_at=now(),factors=excluded.factors,freshness_score=excluded.freshness_score,staleness_status=excluded.staleness_status,reverification_due_at=excluded.reverification_due_at,freshness_computed_at=now();
 return jsonb_build_object('location_id',p_location_id,'confidence_score',v_conf,'freshness_score',v_freshness,'staleness_status',v_status,'last_verified_at',v_last_verified,'reverification_due_at',v_due,'freshness_age_days',round(v_age_days,2));
end
$function$;

create or replace view public.restroom_intelligence as
with obs as (
  select location_id,observation_count,last_observed_at,recent_positive_count,recent_negative_count,
         weighted_observation_count,weighted_positive_count,weighted_negative_count
  from public.external_observation_live_summary
)
select p.id as place_id,p.location_id,p.name,p.latitude,p.longitude,
  coalesce(l.cleanliness_pct,0::numeric) as base_cleanliness_pct,
  coalesce(l.bathroom_verification_count,0) as verification_count,
  coalesce(l.bathroom_positive_count,0) as positive_count,
  coalesce(l.bathroom_negative_count,0) as negative_count,
  coalesce(obs.observation_count,0) as observation_count,
  obs.last_observed_at,
  greatest(0::numeric,extract(epoch from(now()-coalesce(obs.last_observed_at,l.updated_at,p.updated_at)))/86400::numeric) as age_days,
  case when obs.last_observed_at is null then 0::numeric else greatest(0::numeric,1::numeric-(extract(epoch from(now()-obs.last_observed_at))/2592000::numeric)) end as freshness_factor,
  case when coalesce(obs.weighted_positive_count,0::numeric)+coalesce(obs.weighted_negative_count,0::numeric)>0::numeric then obs.weighted_positive_count/nullif(obs.weighted_positive_count+obs.weighted_negative_count,0::numeric) else null::numeric end as weighted_community_agreement,
  (coalesce(obs.weighted_positive_count,0::numeric)>0::numeric and coalesce(obs.weighted_negative_count,0::numeric)>0::numeric) as has_recent_conflict,
  round(least(100::numeric,greatest(0::numeric,coalesce(l.cleanliness_pct,50::numeric)*0.50 + least(18::numeric,coalesce(l.bathroom_verification_count,0)::numeric*1.8) + least(17::numeric,coalesce(obs.weighted_observation_count,0::numeric)*2::numeric) + case when obs.last_observed_at is null then 0::numeric else greatest(0::numeric,10::numeric*(1::numeric-(extract(epoch from(now()-obs.last_observed_at))/2592000::numeric))) end + case when coalesce(obs.weighted_positive_count,0::numeric)>coalesce(obs.weighted_negative_count,0::numeric) and coalesce(obs.weighted_negative_count,0::numeric)=0::numeric then 5 else 0 end - case when coalesce(obs.weighted_negative_count,0::numeric)>coalesce(obs.weighted_positive_count,0::numeric) then 8 else 0 end)))::integer as intelligence_score,
  case when obs.last_observed_at is null then 'No recent community observation' when extract(epoch from(now()-obs.last_observed_at))/86400::numeric<=1 then 'Observed today' when extract(epoch from(now()-obs.last_observed_at))/86400::numeric<=7 then 'Observed this week' when extract(epoch from(now()-obs.last_observed_at))/86400::numeric<=30 then 'Observed this month' else 'Observation is stale' end as freshness_label
from public.places p left join public.locations l on l.id=p.location_id left join obs on obs.location_id=p.location_id
where p.is_active=true and p.category='restroom';

truncate table public.external_observations;
