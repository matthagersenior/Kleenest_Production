create table if not exists public.semantic_search_queries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 query_text text not null check (length(trim(query_text)) between 1 and 500),
 normalized_query text,
 interpreted_filters jsonb not null default '{}'::jsonb,
 result_location_ids uuid[] not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.semantic_search_queries enable row level security;
revoke all on public.semantic_search_queries from anon, authenticated;
create index if not exists semantic_search_queries_user_created_idx on public.semantic_search_queries(user_id,created_at desc);

create or replace function public.semantic_location_search(p_query text,p_lat double precision default null,p_lng double precision default null,p_radius_m integer default 16093,p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare v_query text:=trim(coalesce(p_query,'')); v_norm text; v_limit integer:=greatest(1,least(coalesce(p_limit,25),100)); v_radius integer:=greatest(1000,least(coalesce(p_radius_m,16093),80467)); v_results jsonb; v_filters jsonb:='{}'::jsonb; v_ids uuid[];
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if v_query='' then raise exception 'Search query is required'; end if;
 v_norm:=lower(regexp_replace(v_query,'\s+',' ','g'));
 -- Deterministic semantic-lite interpretation. An eventual LLM may produce this
 -- same contract, but canonical SQL remains the source of truth for results.
 if v_norm ~ '(wheelchair|accessible|ada)' then v_filters:=v_filters||jsonb_build_object('accessible',true); end if;
 if v_norm ~ '(changing table|diaper|baby|child)' then v_filters:=v_filters||jsonb_build_object('changing_table',true); end if;
 if v_norm ~ '(gas|fuel|gas station)' then v_filters:=v_filters||jsonb_build_object('place_type','gas'); end if;
 if v_norm ~ '(restaurant|food|dining)' then v_filters:=v_filters||jsonb_build_object('place_type','restaurant'); end if;
 if v_norm ~ '(shopping|store|retail)' then v_filters:=v_filters||jsonb_build_object('place_type','retail'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.recommendation_score desc,x.distance_meters),'[]'::jsonb),coalesce(array_agg(x.id),'{}') into v_results,v_ids from (
   select l.id,l.name,l.address,l.city,l.state,l.latitude,l.longitude,l.place_type,l.accessible,l.changing_table,l.cleanliness_pct,l.rating,l.review_count,
   round((6371000*2*asin(sqrt(power(sin(radians(l.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(l.latitude))*power(sin(radians(l.longitude-p_lng)/2),2))))::numeric,1) distance_meters,
   public.rank_location_recommendation((6371000*2*asin(sqrt(power(sin(radians(l.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(l.latitude))*power(sin(radians(l.longitude-p_lng)/2),2)))),v_radius,coalesce((public.get_location_trust_summary(l.id)->>'trust_score')::integer,0),coalesce((public.get_location_trust_summary(l.id)->>'freshness_score')::integer,0),coalesce(l.accessible,false)) recommendation_score
   from public.locations l
   where l.is_active=true
     and (p_lat is null or p_lng is null or (l.latitude between p_lat-v_radius/111320.0 and p_lat+v_radius/111320.0 and l.longitude between p_lng-v_radius/(111320.0*greatest(cos(radians(p_lat)),0.1)) and p_lng+v_radius/(111320.0*greatest(cos(radians(p_lat)),0.1)) and (6371000*2*asin(sqrt(power(sin(radians(l.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(l.latitude))*power(sin(radians(l.longitude-p_lng)/2),2))))<=v_radius))
     and (not (v_filters ? 'accessible') or l.accessible=true)
     and (not (v_filters ? 'changing_table') or l.changing_table=true)
     and (not (v_filters ? 'place_type') or lower(coalesce(l.place_type,''))=v_filters->>'place_type')
     and (v_norm like '%'||lower(coalesce(l.name,''))||'%' or lower(coalesce(l.address,'')) like '%'||v_norm||'%' or lower(coalesce(l.city,'')) like '%'||v_norm||'%' or lower(coalesce(l.place_type,'')) like '%'||v_norm||'%' or v_norm ~ '(restroom|bathroom|toilet|washroom|bath)')
   order by recommendation_score desc,distance_meters limit v_limit
 ) x;
 insert into public.semantic_search_queries(user_id,query_text,normalized_query,interpreted_filters,result_location_ids) values(auth.uid(),v_query,v_norm,v_filters,v_ids);
 return jsonb_build_object('query',v_query,'interpreted_filters',v_filters,'results',v_results,'semantic_mode','deterministic-canonical','ai_ready',true);
end; $$;
revoke all on function public.semantic_location_search(text,double precision,double precision,integer,integer) from anon;
grant execute on function public.semantic_location_search(text,double precision,double precision,integer,integer) to authenticated;
