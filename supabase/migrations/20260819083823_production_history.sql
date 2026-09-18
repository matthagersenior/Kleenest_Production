create table if not exists public.contributor_reputation (
 user_id uuid primary key references auth.users(id) on delete cascade,
 observations_count integer not null default 0,
 verified_checkins_count integer not null default 0,
 positive_observations_count integer not null default 0,
 negative_observations_count integer not null default 0,
 confirmed_observations_count integer not null default 0,
 reputation_score numeric(6,2) not null default 0,
 verification_level text not null default 'new' check (verification_level in ('new','contributor','trusted','verified')),
 last_activity_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists contributor_reputation_level_idx on public.contributor_reputation(verification_level);

alter table public.contributor_reputation enable row level security;
drop policy if exists contributor_reputation_public_read on public.contributor_reputation;
create policy contributor_reputation_public_read on public.contributor_reputation for select using (true);

create or replace function public.refresh_contributor_reputation(p_user_id uuid)
returns public.contributor_reputation
language plpgsql
security definer
set search_path=public
as $$
declare r public.contributor_reputation;
begin
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
   reputation_score=least(100, cr.observations_count*5 + cr.verified_checkins_count*8 + cr.confirmed_observations_count*4 + greatest(0,cr.positive_observations_count-cr.negative_observations_count)*2),
   verification_level=case when cr.observations_count>=20 and cr.verified_checkins_count>=10 then 'verified' when cr.observations_count>=8 and cr.verified_checkins_count>=4 then 'trusted' when cr.observations_count>=2 then 'contributor' else 'new' end
 where cr.user_id=p_user_id;
 select * into r from public.contributor_reputation where user_id=p_user_id;
 return r;
end; $$;

grant execute on function public.refresh_contributor_reputation(uuid) to authenticated;
grant select on public.contributor_reputation to anon,authenticated;
