-- Keep dense-area discovery reuse effective without allowing expired city cells to accumulate forever.
create index if not exists nearby_response_cache_created_at_idx on kleenest_api_private.nearby_response_cache(created_at);
create or replace function kleenest_api_private.map_network_nearby_all_cached_v1(
 p_lat double precision,p_lng double precision,p_radius_m integer default 8047,p_limit integer default 500,p_search text default null)
returns setof jsonb language plpgsql volatile security definer
set search_path to 'pg_catalog','public','extensions','kleenest_api_private' as $$
declare v_key text; v_response jsonb; v_now timestamptz:=clock_timestamp();
begin
 v_key:=md5(round(p_lat::numeric,4)::text||'|'||round(p_lng::numeric,4)::text||'|'||p_radius_m::text||'|'||p_limit::text||'|'||lower(trim(coalesce(p_search,''))));
 select response into v_response from kleenest_api_private.nearby_response_cache where cache_key=v_key and created_at>v_now-interval '30 seconds';
 if v_response is not null then return query select value from jsonb_array_elements(v_response); return; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,0));
 select response into v_response from kleenest_api_private.nearby_response_cache where cache_key=v_key and created_at>clock_timestamp()-interval '30 seconds';
 if v_response is null then
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_response from kleenest_api_private.map_network_nearby_all_core_v1(p_lat,p_lng,p_radius_m,p_limit,p_search) x;
  insert into kleenest_api_private.nearby_response_cache(cache_key,response,created_at) values(v_key,v_response,clock_timestamp())
  on conflict(cache_key) do update set response=excluded.response,created_at=excluded.created_at;
  if random()<0.05 then delete from kleenest_api_private.nearby_response_cache where created_at<clock_timestamp()-interval '5 minutes'; end if;
 end if;
 return query select value from jsonb_array_elements(v_response);
end $$;