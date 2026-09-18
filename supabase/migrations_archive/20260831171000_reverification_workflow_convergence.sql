create or replace function public.get_location_amenity_inventory(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with recent as (
  select o.amenity_id,o.status,o.observed_quantity,o.observed_at,o.user_id
  from public.location_amenity_observations o
  where o.location_id=p_location_id and o.observed_at>=now()-interval '180 days'
), agg as (
  select a.id amenity_id,a.name,a.category,
    round(avg(r.observed_quantity) filter(where r.status='present' and r.observed_quantity is not null)::numeric)::int observed_quantity,
    count(*)::int sample_count,count(distinct r.user_id)::int contributor_count,
    count(*) filter(where r.status='present')::int present_count,
    count(*) filter(where r.status='absent')::int absent_count,
    max(r.observed_at) freshest_observed_at
  from public.amenities a left join recent r on r.amenity_id=a.id
  where exists(select 1 from public.location_amenities la where la.location_id=p_location_id and la.amenity_id=a.id) or r.amenity_id is not null
  group by a.id,a.name,a.category
), scored as (
  select *, (present_count>0 and absent_count>0 and greatest(present_count,absent_count)<3*least(present_count,absent_count)) unresolved_conflict
  from agg
)
select coalesce(jsonb_agg(jsonb_build_object(
  'amenity_id',amenity_id,'name',name,'category',category,'observed_quantity',observed_quantity,
  'sample_count',sample_count,'contributor_count',contributor_count,'present_count',present_count,'absent_count',absent_count,
  'status_conflict',unresolved_conflict,
  'consensus_status',case when present_count=0 and absent_count=0 then 'unknown' when present_count>=3*greatest(absent_count,1) then 'present' when absent_count>=3*greatest(present_count,1) then 'absent' when unresolved_conflict then 'disputed' when present_count>=absent_count then 'present' else 'absent' end,
  'confidence_score',case when sample_count=0 then 0 else greatest(0,least(100,35+least(30,contributor_count*10)+case when freshest_observed_at>=now()-interval '7 days' then 25 when freshest_observed_at>=now()-interval '30 days' then 15 when freshest_observed_at>=now()-interval '90 days' then 5 else 0 end-case when unresolved_conflict then 20 else 0 end))::int end,
  'freshness',case when freshest_observed_at is null then 'unknown' when freshest_observed_at>=now()-interval '7 days' then 'fresh' when freshest_observed_at>=now()-interval '30 days' then 'recent' when freshest_observed_at>=now()-interval '90 days' then 'aging' else 'stale' end,
  'freshest_observed_at',freshest_observed_at
) order by category,name),'[]'::jsonb) from scored;
$function$;

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
), per_amenity as (
  select amenity_id,count(*) filter(where status='present')::int present_count,count(*) filter(where status='absent')::int absent_count
  from public.location_amenity_observations
  where location_id=p_location_id and observed_at>=now()-interval '90 days' and status in('present','absent')
  group by amenity_id
), conflicts as (
  select count(*) filter(where present_count>0 and absent_count>0 and greatest(present_count,absent_count)<3*least(present_count,absent_count))::int conflict_count,
         count(*) filter(where present_count>0 and absent_count>0 and greatest(present_count,absent_count)>=3*least(present_count,absent_count))::int resolved_by_consensus
  from per_amenity
), base as (
  select l.id,l.updated_at,greatest(l.updated_at,coalesce(o.latest_observed_at,l.updated_at)) latest_evidence_at,
    o.total_observations,o.contributor_count,o.recent_amenities,c.conflict_count,c.resolved_by_consensus
  from public.locations l cross join obs o cross join conflicts c where l.id=p_location_id and l.is_active=true
)
select case when id is null then null else jsonb_build_object(
  'location_id',id,'latest_evidence_at',latest_evidence_at,
  'freshness',case when latest_evidence_at>=now()-interval '7 days' then 'fresh' when latest_evidence_at>=now()-interval '30 days' then 'recent' when latest_evidence_at>=now()-interval '90 days' then 'aging' else 'stale' end,
  'stale',latest_evidence_at<now()-interval '90 days','total_observations',total_observations,'contributor_count',contributor_count,
  'recent_amenities',recent_amenities,'contradiction_count',conflict_count,'resolved_by_consensus',resolved_by_consensus,
  'consensus_policy','3_to_1_canonical_observation_consensus','needs_reverification',(latest_evidence_at<now()-interval '90 days' or conflict_count>0 or total_observations<2),
  'quality_score',greatest(0,least(100,50+least(25,contributor_count*8)+least(15,recent_amenities*3)+case when latest_evidence_at>=now()-interval '30 days' then 10 when latest_evidence_at>=now()-interval '90 days' then 0 else -15 end-least(40,conflict_count*15)))::int,
  'generated_at',now()
) end from base;
$function$;

create or replace function public.business_reverification_queue(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and coalesce(bm.status,'active')='active') then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.name),'[]'::jsonb) into result from (
   select l.id location_id,l.name,q,
     (case when coalesce((q->>'contradiction_count')::int,0)>0 then 50 else 0 end + case when coalesce((q->>'stale')::boolean,false) then 30 else 0 end + case when coalesce((q->>'total_observations')::int,0)<2 then 20 else 0 end)::int priority_score,
     case when coalesce((q->>'contradiction_count')::int,0)>0 then 'resolve_conflict' when coalesce((q->>'stale')::boolean,false) then 'refresh_stale_evidence' else 'increase_evidence' end suggested_action
   from public.locations l join public.business_locations bl on bl.location_id=l.id and bl.business_id=p_business_id
   cross join lateral public.get_location_trust_quality(l.id) q
   where l.is_active=true and coalesce((q->>'needs_reverification')::boolean,false)
 ) x;
 return jsonb_build_object('business_id',p_business_id,'queue',result,'generated_at',now());
end;
$function$;

create or replace function public.business_create_reverification_qr(p_business_id uuid,p_location_id uuid)
returns public.qr_codes
language plpgsql
security definer
set search_path to ''
as $function$
declare v public.qr_codes; q jsonb;
begin
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 if not exists(select 1 from public.business_locations where business_id=p_business_id and location_id=p_location_id) then raise exception 'Location does not belong to business'; end if;
 q:=public.get_location_trust_quality(p_location_id);
 if not coalesce((q->>'needs_reverification')::boolean,false) then raise exception 'Location does not currently need reverification'; end if;
 v:=public.business_create_custom_qr(p_business_id,p_location_id,'Help reverify this restroom','trust_reverification','trust_mission',jsonb_build_object('location_id',p_location_id,'source','qr_reverification','priority',case when coalesce((q->>'contradiction_count')::int,0)>0 then 'high' else 'medium' end),jsonb_build_object('frame_label','Help verify this restroom','cta_label','Scan to start a Kleenest trust mission'),false,null);
 return v;
end;
$function$;

revoke all on function public.get_location_amenity_inventory(uuid) from public,anon;
revoke all on function public.get_location_trust_quality(uuid) from public,anon;
revoke all on function public.business_reverification_queue(uuid) from public,anon;
revoke all on function public.business_create_reverification_qr(uuid,uuid) from public,anon;
grant execute on function public.get_location_amenity_inventory(uuid) to authenticated,service_role;
grant execute on function public.get_location_trust_quality(uuid) to authenticated,service_role;
grant execute on function public.business_reverification_queue(uuid) to authenticated,service_role;
grant execute on function public.business_create_reverification_qr(uuid,uuid) to authenticated,service_role;
