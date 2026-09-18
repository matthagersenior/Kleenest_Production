create or replace function public.consumer_progression_rankings(p_scope text default 'global',p_metric text default 'xp',p_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_scope text:=lower(coalesce(p_scope,'global'));v_metric text:=lower(coalesce(p_metric,'xp'));v_lat double precision:=nullif(p_context->>'latitude','')::double precision;v_lon double precision:=nullif(p_context->>'longitude','')::double precision;v_radius double precision:=coalesce(nullif(p_context->>'radius_m','')::double precision,25000);v_city text:=nullif(lower(p_context->>'city'),'');v_state text:=nullif(lower(p_context->>'state'),'');v_business uuid:=nullif(p_context->>'business_id','')::uuid;v_location uuid:=nullif(p_context->>'location_id','')::uuid;v_specialty text:=nullif(lower(p_context->>'specialty'),'');v_objective uuid:=nullif(p_context->>'objective_id','')::uuid;v_result jsonb;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if v_scope not in ('global','following','local','city','state','national','business','location','campaign','contest','specialty') then raise exception 'unsupported ranking scope'; end if;
 if v_metric not in ('xp','discoveries','verified_contributions','accessibility','photos','helpfulness','journeys','contest_score') then raise exception 'unsupported ranking metric'; end if;
 with eligible as (
   select e.*,a.specialty,l.city,l.state,l.latitude,l.longitude,l.business_id,l.claimed_business_id
   from public.progression_events_v2 e
   join public.progression_xp_actions a on a.action=e.action
   left join public.locations l on l.id=e.location_id
   where e.status='awarded'
     and case v_scope
       when 'global' then true
       when 'national' then true
       when 'following' then e.user_id=v_user or exists(select 1 from public.follows f where f.follower_id=v_user and f.following_id=e.user_id)
       when 'local' then v_lat is not null and v_lon is not null and l.latitude is not null and l.longitude is not null and 111320*sqrt(power(l.latitude-v_lat,2)+power((l.longitude-v_lon)*cos(radians(v_lat)),2))<=v_radius
       when 'city' then v_city is not null and lower(coalesce(l.city,''))=v_city
       when 'state' then v_state is not null and lower(coalesce(l.state,''))=v_state
       when 'business' then v_business is not null and (l.business_id=v_business or l.claimed_business_id=v_business)
       when 'location' then v_location is not null and e.location_id=v_location
       when 'specialty' then v_specialty is not null and lower(coalesce(a.specialty,''))=v_specialty
       when 'campaign' then v_objective is not null and (e.subject->>'objective_id')::uuid=v_objective
       when 'contest' then v_objective is not null and ((e.subject->>'objective_id')::uuid=v_objective or e.action='contest_place')
       else false end
 ), scored as (
   select user_id,sum(case v_metric
     when 'xp' then xp_awarded
     when 'discoveries' then case when action like 'discover_%' then 1 else 0 end
     when 'verified_contributions' then case when action in ('verify_location','reverify_stale') then 1 else 0 end
     when 'accessibility' then case when action='add_accessibility' then 1 else 0 end
     when 'photos' then case when action='add_photo' then 1 else 0 end
     when 'helpfulness' then case when action='helpful_contribution' then 1 else 0 end
     when 'journeys' then case when action='journey_complete' then 1 else 0 end
     when 'contest_score' then case when action='contest_place' then xp_awarded else 0 end
     else 0 end)::bigint score
   from eligible group by user_id
 ), ranked as (
   select user_id,score,dense_rank() over(order by score desc,user_id) rank from scored where score>0
 )
 select coalesce(jsonb_agg(jsonb_build_object('user_id',r.user_id,'score',r.score,'rank',r.rank,'scope',v_scope,'metric',v_metric,'is_current_user',r.user_id=v_user) order by r.rank),'[]'::jsonb)
 into v_result from (select * from ranked order by rank limit 100) r;
 return coalesce(v_result,'[]'::jsonb);
end $$;
grant execute on function public.consumer_progression_rankings(text,text,jsonb) to authenticated;
