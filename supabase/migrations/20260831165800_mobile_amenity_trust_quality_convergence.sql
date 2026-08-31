create or replace function public.get_location_amenity_inventory(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with recent as (
  select o.amenity_id,o.status,o.observed_quantity,o.observed_at,o.user_id,o.verification_method
  from public.location_amenity_observations o
  where o.location_id=p_location_id
    and o.observed_at>=now()-interval '180 days'
), agg as (
  select a.id amenity_id,a.name,a.category,
    round(avg(r.observed_quantity) filter(where r.status='present' and r.observed_quantity is not null)::numeric)::int observed_quantity,
    count(*)::int sample_count,
    count(distinct r.user_id)::int contributor_count,
    count(*) filter(where r.status='present')::int present_count,
    count(*) filter(where r.status='absent')::int absent_count,
    max(r.observed_at) freshest_observed_at,
    case when count(*)=0 then 0 else round(least(100::numeric,
      35 + least(30,count(distinct r.user_id)*10) +
      case when max(r.observed_at)>=now()-interval '7 days' then 25 when max(r.observed_at)>=now()-interval '30 days' then 15 when max(r.observed_at)>=now()-interval '90 days' then 5 else 0 end -
      case when count(*) filter(where r.status='present')>0 and count(*) filter(where r.status='absent')>0 then 20 else 0 end
    ),0)::int end confidence_score
  from public.amenities a
  left join recent r on r.amenity_id=a.id
  where exists(select 1 from public.location_amenities la where la.location_id=p_location_id and la.amenity_id=a.id)
     or r.amenity_id is not null
  group by a.id,a.name,a.category
)
select coalesce(jsonb_agg(jsonb_build_object(
  'amenity_id',amenity_id,'name',name,'category',category,
  'observed_quantity',observed_quantity,'sample_count',sample_count,'contributor_count',contributor_count,
  'present_count',present_count,'absent_count',absent_count,
  'status_conflict',(present_count>0 and absent_count>0),
  'confidence_score',confidence_score,
  'freshness',case when freshest_observed_at is null then 'unknown' when freshest_observed_at>=now()-interval '7 days' then 'fresh' when freshest_observed_at>=now()-interval '30 days' then 'recent' when freshest_observed_at>=now()-interval '90 days' then 'aging' else 'stale' end,
  'freshest_observed_at',freshest_observed_at
) order by category,name),'[]'::jsonb) from agg;
$function$;

revoke all on function public.get_location_amenity_inventory(uuid) from public, anon;
grant execute on function public.get_location_amenity_inventory(uuid) to authenticated, service_role;

create or replace function public.get_location_trust_quality(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with obs as (
  select count(*)::int total_observations,count(distinct user_id)::int contributor_count,max(observed_at) latest_observed_at,
    count(distinct amenity_id) filter(where observed_at>=now()-interval '30 days')::int recent_amenities
  from public.location_amenity_observations where location_id=p_location_id
), conflicts as (
  select count(*)::int conflict_count from (
    select amenity_id from public.location_amenity_observations
    where location_id=p_location_id and observed_at>=now()-interval '90 days' and status in('present','absent')
    group by amenity_id having bool_or(status='present') and bool_or(status='absent')
  ) x
), base as (
  select l.id,l.updated_at,
    greatest(l.updated_at,coalesce(o.latest_observed_at,l.updated_at)) latest_evidence_at,
    o.total_observations,o.contributor_count,o.recent_amenities,c.conflict_count
  from public.locations l cross join obs o cross join conflicts c
  where l.id=p_location_id and l.is_active=true
)
select case when id is null then null else jsonb_build_object(
  'location_id',id,'latest_evidence_at',latest_evidence_at,
  'freshness',case when latest_evidence_at>=now()-interval '7 days' then 'fresh' when latest_evidence_at>=now()-interval '30 days' then 'recent' when latest_evidence_at>=now()-interval '90 days' then 'aging' else 'stale' end,
  'stale',latest_evidence_at<now()-interval '90 days',
  'total_observations',total_observations,'contributor_count',contributor_count,'recent_amenities',recent_amenities,
  'contradiction_count',conflict_count,
  'needs_reverification',(latest_evidence_at<now()-interval '90 days' or conflict_count>0 or total_observations<2),
  'quality_score',greatest(0,least(100,50 + least(25,contributor_count*8) + least(15,recent_amenities*3) + case when latest_evidence_at>=now()-interval '30 days' then 10 when latest_evidence_at>=now()-interval '90 days' then 0 else -15 end - least(40,conflict_count*15)))::int,
  'generated_at',now()
) end from base;
$function$;

revoke all on function public.get_location_trust_quality(uuid) from public, anon;
grant execute on function public.get_location_trust_quality(uuid) to authenticated, service_role;
