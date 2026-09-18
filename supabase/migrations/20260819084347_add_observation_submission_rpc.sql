create or replace function public.submit_restroom_observation(p_location_id uuid,p_observation_type text,p_cleanliness_pct numeric default null,p_note text default null,p_check_in_id uuid default null)
returns public.restroom_observations
language plpgsql security definer set search_path=public
as $$
declare r public.restroom_observations; uid uuid;
begin
 select auth.uid() into uid;
 if uid is null then raise exception 'Authentication required'; end if;
 if p_observation_type not in ('clean','supplies_stocked','open','needs_cleaning','supplies_low','closed_unavailable') then raise exception 'Invalid observation type'; end if;
 if p_cleanliness_pct is not null and (p_cleanliness_pct<0 or p_cleanliness_pct>100) then raise exception 'Cleanliness must be between 0 and 100'; end if;
 if p_check_in_id is not null and not exists(select 1 from public.check_ins where id=p_check_in_id and user_id=uid) then raise exception 'Check-in does not belong to current user'; end if;
 insert into public.restroom_observations(location_id,user_id,check_in_id,observation_type,cleanliness_pct,note,source,confidence)
 values(p_location_id,uid,p_check_in_id,p_observation_type,p_cleanliness_pct,p_note,'community',case when p_check_in_id is not null then 1 else .7 end)
 returning * into r;
 perform public.refresh_contributor_reputation(uid);
 perform public.refresh_contributor_milestones(uid);
 return r;
end; $$;
grant execute on function public.submit_restroom_observation(uuid,text,numeric,text,uuid) to authenticated;
