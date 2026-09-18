create or replace function public.rank_location_recommendation(p_distance_meters double precision,p_radius_meters integer,p_trust_score integer,p_freshness_score integer,p_accessible boolean)
returns integer
language sql immutable
set search_path = public, pg_catalog
as $$
select greatest(0,least(100,round((0.55*greatest(0,least(100,100-(p_distance_meters/greatest(p_radius_meters,1)*100)))+0.25*greatest(0,least(100,coalesce(p_trust_score,0)))+0.15*greatest(0,least(100,coalesce(p_freshness_score,0)))+0.05*case when coalesce(p_accessible,false) then 100 else 0 end)::numeric,0)))::integer
$$;

create index if not exists locations_active_lat_lng_idx on public.locations (latitude, longitude) where is_active = true;
create index if not exists location_bathroom_intelligence_location_idx on public.location_bathroom_intelligence (location_id, updated_at desc);
