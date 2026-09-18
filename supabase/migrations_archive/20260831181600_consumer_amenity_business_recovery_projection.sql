create or replace function public.get_location_amenity_inventory(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with recent as (
  select o.amenity_id,o.status,o.observed_quantity,o.observed_at,o.user_id,o.metadata
  from public.location_amenity_observations o
  where o.location_id=p_location_id and o.observed_at>=now()-interval '180 days'
), agg as (
  select a.id amenity_id,a.name,a.category,
    round(avg(r.observed_quantity) filter(where r.status='present' and r.observed_quantity is not null)::numeric)::int observed_quantity,
    count(*)::int sample_count,count(distinct r.user_id)::int contributor_count,
    count(*) filter(where r.status='present')::int present_count,
    count(*) filter(where r.status='absent')::int absent_count,
    max(r.observed_at) freshest_observed_at,
    max(r.observed_at) filter(where r.status='absent' or coalesce(r.metadata->>'sentiment','')='needs_attention') latest_attention_at
  from public.amenities a left join recent r on r.amenity_id=a.id
  where exists(select 1 from public.location_amenities la where la.location_id=p_location_id and la.amenity_id=a.id) or r.amenity_id is not null
  group by a.id,a.name,a.category
), scored as (
  select *, (present_count>0 and absent_count>0 and greatest(present_count,absent_count)<3*least(present_count,absent_count)) unresolved_conflict from agg
), response as (
  select distinct on (c.amenity_id) c.amenity_id,c.status,c.opened_at,c.assigned_at,c.started_at,c.resolved_at,c.resolution_media_id,c.updated_at
  from public.business_restroom_remediation_cases c
  where c.location_id=p_location_id
  order by c.amenity_id,c.opened_at desc,c.updated_at desc
)
select coalesce(jsonb_agg(jsonb_build_object(
  'amenity_id',s.amenity_id,'name',s.name,'category',s.category,'observed_quantity',s.observed_quantity,
  'sample_count',s.sample_count,'contributor_count',s.contributor_count,'present_count',s.present_count,'absent_count',s.absent_count,
  'status_conflict',s.unresolved_conflict,
  'consensus_status',case when s.present_count=0 and s.absent_count=0 then 'unknown' when s.present_count>=3*greatest(s.absent_count,1) then 'present' when s.absent_count>=3*greatest(s.present_count,1) then 'absent' when s.unresolved_conflict then 'disputed' when s.present_count>=s.absent_count then 'present' else 'absent' end,
  'confidence_score',case when s.sample_count=0 then 0 else greatest(0,least(100,35+least(30,s.contributor_count*10)+case when s.freshest_observed_at>=now()-interval '7 days' then 25 when s.freshest_observed_at>=now()-interval '30 days' then 15 when s.freshest_observed_at>=now()-interval '90 days' then 5 else 0 end-case when s.unresolved_conflict then 20 else 0 end))::int end,
  'freshness',case when s.freshest_observed_at is null then 'unknown' when s.freshest_observed_at>=now()-interval '7 days' then 'fresh' when s.freshest_observed_at>=now()-interval '30 days' then 'recent' when s.freshest_observed_at>=now()-interval '90 days' then 'aging' else 'stale' end,
  'freshest_observed_at',s.freshest_observed_at,
  'business_response_status',case when r.status='open' then 'reported' when r.status in ('assigned','in_progress') then 'being_addressed' when r.status='resolved' and (s.latest_attention_at is null or r.resolved_at>=s.latest_attention_at) then 'addressed' else null end,
  'business_response_at',case when r.status='resolved' and (s.latest_attention_at is null or r.resolved_at>=s.latest_attention_at) then r.resolved_at when r.status='in_progress' then coalesce(r.started_at,r.assigned_at,r.opened_at) when r.status='assigned' then coalesce(r.assigned_at,r.opened_at) when r.status='open' then r.opened_at else null end,
  'business_proof_available',case when r.status='resolved' and r.resolution_media_id is not null and (s.latest_attention_at is null or r.resolved_at>=s.latest_attention_at) then true else false end
) order by s.category,s.name),'[]'::jsonb)
from scored s left join response r on r.amenity_id=s.amenity_id;
$$;

revoke all on function public.get_location_amenity_inventory(uuid) from public;
grant execute on function public.get_location_amenity_inventory(uuid) to anon,authenticated,service_role;
