create or replace function public.refresh_contributor_reputation(p_user_id uuid)
returns public.contributor_reputation
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
declare r public.contributor_reputation;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'User identity mismatch'; end if;
  insert into public.contributor_reputation(user_id) values(auth.uid()) on conflict(user_id) do nothing;
  update public.contributor_reputation cr set
    observations_count=(select count(*) from public.restroom_observations ro where ro.user_id=auth.uid()),
    verified_checkins_count=(select count(*) from public.check_ins ci where ci.user_id=auth.uid() and coalesce(ci.verified,true)=true),
    positive_observations_count=(select count(*) from public.restroom_observations ro where ro.user_id=auth.uid() and ro.observation_type in ('clean','supplies_stocked','open')),
    negative_observations_count=(select count(*) from public.restroom_observations ro where ro.user_id=auth.uid() and ro.observation_type in ('needs_cleaning','supplies_low','closed_unavailable')),
    last_activity_at=greatest((select max(ro.created_at) from public.restroom_observations ro where ro.user_id=auth.uid()),(select max(ci.created_at) from public.check_ins ci where ci.user_id=auth.uid())),
    updated_at=now()
  where cr.user_id=auth.uid();
  update public.contributor_reputation cr set
    confirmed_observations_count=least(cr.observations_count,cr.verified_checkins_count),
    reputation_score=least(100,
      cr.verified_checkins_count*4 +
      greatest(0,cr.observations_count-cr.verified_checkins_count)*2 +
      cr.confirmed_observations_count*6 +
      greatest(0,cr.positive_observations_count-cr.negative_observations_count)*2
    ),
    verification_level=case
      when cr.confirmed_observations_count>=10 and cr.verified_checkins_count>=10 then 'verified'
      when cr.confirmed_observations_count>=4 and cr.verified_checkins_count>=4 then 'trusted'
      when cr.observations_count>=2 and cr.verified_checkins_count>=1 then 'contributor'
      else 'new' end
  where cr.user_id=auth.uid();
  select * into r from public.contributor_reputation where user_id=auth.uid();
  return r;
end; $$;
