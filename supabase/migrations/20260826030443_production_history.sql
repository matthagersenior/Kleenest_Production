create or replace function public.recompute_contributor_reputation(p_user_id uuid)
returns public.contributor_reputation
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
declare r public.contributor_reputation;
begin
  if p_user_id is null then return null; end if;
  insert into public.contributor_reputation(user_id) values(p_user_id) on conflict(user_id) do nothing;
  update public.contributor_reputation cr set
    observations_count=(select count(*) from public.restroom_observations ro where ro.user_id=p_user_id),
    verified_checkins_count=(select count(*) from public.check_ins ci where ci.user_id=p_user_id and coalesce(ci.verified,true)=true),
    positive_observations_count=(select count(*) from public.restroom_observations ro where ro.user_id=p_user_id and ro.observation_type in ('clean','supplies_stocked','open')),
    negative_observations_count=(select count(*) from public.restroom_observations ro where ro.user_id=p_user_id and ro.observation_type in ('needs_cleaning','supplies_low','closed_unavailable')),
    last_activity_at=greatest((select max(ro.created_at) from public.restroom_observations ro where ro.user_id=p_user_id),(select max(ci.created_at) from public.check_ins ci where ci.user_id=p_user_id)),
    updated_at=now()
  where cr.user_id=p_user_id;
  update public.contributor_reputation cr set
    confirmed_observations_count=least(cr.observations_count,cr.verified_checkins_count),
    reputation_score=least(100,cr.verified_checkins_count*4+greatest(0,cr.observations_count-cr.verified_checkins_count)*2+cr.confirmed_observations_count*6+greatest(0,cr.positive_observations_count-cr.negative_observations_count)*2),
    verification_level=case when cr.confirmed_observations_count>=10 and cr.verified_checkins_count>=10 then 'verified' when cr.confirmed_observations_count>=4 and cr.verified_checkins_count>=4 then 'trusted' when cr.observations_count>=2 and cr.verified_checkins_count>=1 then 'contributor' else 'new' end
  where cr.user_id=p_user_id;
  select * into r from public.contributor_reputation where user_id=p_user_id;
  return r;
end; $$;

create or replace function public.refresh_contributor_reputation(p_user_id uuid)
returns public.contributor_reputation
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'User identity mismatch'; end if;
  return public.recompute_contributor_reputation(p_user_id);
end; $$;

create or replace function public.refresh_reputation_for_evidence_user()
returns trigger
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
declare v_user uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);
  if v_user is not null then perform public.recompute_contributor_reputation(v_user); end if;
  return coalesce(new, old);
exception when others then
  raise warning 'Contributor reputation refresh skipped: %', sqlerrm;
  return coalesce(new, old);
end; $$;

create table if not exists public.contributor_reputation_consistency_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  stored_score integer,
  expected_score integer,
  stored_level text,
  expected_level text,
  score_delta integer not null,
  checked_at timestamptz not null default now(),
  repaired boolean not null default false
);

create or replace function public.audit_contributor_reputation_consistency(p_repair boolean default false)
returns table(user_id uuid,stored_score integer,expected_score integer,stored_level text,expected_level text,score_delta integer,repaired boolean)
language plpgsql
security definer
set search_path to public, auth, extensions, pg_temp
as $$
declare x record; v_score integer; v_level text; v_repaired boolean;
begin
  for x in select cr.user_id,cr.reputation_score,cr.verification_level,cr.observations_count,cr.verified_checkins_count,cr.confirmed_observations_count,cr.positive_observations_count,cr.negative_observations_count from public.contributor_reputation cr loop
    v_score:=least(100,x.verified_checkins_count*4+greatest(0,x.observations_count-x.verified_checkins_count)*2+x.confirmed_observations_count*6+greatest(0,x.positive_observations_count-x.negative_observations_count)*2);
    v_level:=case when x.confirmed_observations_count>=10 and x.verified_checkins_count>=10 then 'verified' when x.confirmed_observations_count>=4 and x.verified_checkins_count>=4 then 'trusted' when x.observations_count>=2 and x.verified_checkins_count>=1 then 'contributor' else 'new' end;
    v_repaired:=false;
    if x.reputation_score is distinct from v_score or x.verification_level is distinct from v_level then
      if p_repair then perform public.recompute_contributor_reputation(x.user_id); v_repaired:=true; end if;
      insert into public.contributor_reputation_consistency_audit(user_id,stored_score,expected_score,stored_level,expected_level,score_delta,repaired) values(x.user_id,x.reputation_score,v_score,x.verification_level,v_level,v_score-x.reputation_score,v_repaired);
      user_id:=x.user_id;stored_score:=x.reputation_score;expected_score:=v_score;stored_level:=x.verification_level;expected_level:=v_level;score_delta:=v_score-x.reputation_score;repaired:=v_repaired;return next;
    end if;
  end loop;
end; $$;
