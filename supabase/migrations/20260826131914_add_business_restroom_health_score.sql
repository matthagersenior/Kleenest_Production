create or replace function public.business_restroom_health_score(p_business_id uuid, p_location_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth,extensions,pg_catalog
as $$
declare r record; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists (select 1 from business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and coalesce(bm.status,'active')='active') then raise exception 'Business access denied'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.health_score desc),'[]'::jsonb) into result from (
  select l.id location_id,l.name,
   greatest(0,least(100,round((0.30*coalesce(l.cleanliness_pct,0)+0.20*coalesce(l.rating*20,0)+0.20*least(100,coalesce(bi.confidence,0))+0.15*least(100,coalesce(bi.evidence_count,0)*10)+0.15*case when l.bathroom_verification_status in('verified','confirmed') then 100 else 25 end)::numeric,0)))::integer health_score,
   coalesce(bi.confidence,0) bathroom_confidence,coalesce(bi.evidence_count,0) evidence_count,l.cleanliness_pct,l.rating,l.review_count,l.bathroom_verification_status,l.updated_at
  from locations l left join location_bathroom_intelligence bi on bi.location_id=l.id
  where l.is_active=true and (p_location_id is null or l.id=p_location_id)
    and exists(select 1 from business_locations bl where bl.business_id=p_business_id and bl.location_id=l.id)
 ) x;
 return jsonb_build_object('business_id',p_business_id,'location_id',p_location_id,'locations',result,'formula_version','v1');
end; $$;
revoke all on function public.business_restroom_health_score(uuid,uuid) from anon;
grant execute on function public.business_restroom_health_score(uuid,uuid) to authenticated;
