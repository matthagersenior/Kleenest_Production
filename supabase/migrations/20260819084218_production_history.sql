create table if not exists public.contributor_milestones (
 user_id uuid not null references auth.users(id) on delete cascade,
 milestone_key text not null,
 achieved_at timestamptz not null default now(),
 points_awarded integer not null default 0,
 primary key(user_id,milestone_key)
);

alter table public.contributor_milestones enable row level security;
drop policy if exists contributor_milestones_public_read on public.contributor_milestones;
create policy contributor_milestones_public_read on public.contributor_milestones for select using (true);

create or replace function public.refresh_contributor_milestones(p_user_id uuid)
returns table(milestone_key text, achieved boolean, progress integer, target integer, points_awarded integer)
language plpgsql security definer set search_path=public
as $$
declare obs integer; checks integer; reviews integer; m text; target_value integer; reward integer; already boolean;
begin
 select coalesce(observations_count,0),coalesce(verified_checkins_count,0) into obs,checks from contributor_reputation where user_id=p_user_id;
 select coalesce(total_reviews,0) into reviews from profiles where id=p_user_id;
 for m,target_value,reward in values
 ('first_observation',1,10),('five_observations',5,25),('first_verified_checkin',1,15),('five_verified_checkins',5,50),('trusted_contributor',8,75),('verified_contributor',20,150)
 loop
   if m='first_observation' then progress:=least(obs,target_value); elsif m='five_observations' then progress:=least(obs,target_value); elsif m='first_verified_checkin' then progress:=least(checks,target_value); elsif m='five_verified_checkins' then progress:=least(checks,target_value); elsif m='trusted_contributor' then progress:=least(obs,target_value); else progress:=least(obs,target_value); end if;
   if m='trusted_contributor' then achieved:=obs>=8 and checks>=4; elsif m='verified_contributor' then achieved:=obs>=20 and checks>=10; else achieved:=progress>=target_value; end if;
   already:=exists(select 1 from contributor_milestones where user_id=p_user_id and milestone_key=m);
   if achieved and not already then
     insert into contributor_milestones(user_id,milestone_key,points_awarded) values(p_user_id,m,reward);
     insert into reward_transactions(user_id,points,reason,metadata) values(p_user_id,reward,'contributor_milestone',jsonb_build_object('milestone',m));
     update profiles set points=coalesce(points,0)+reward where id=p_user_id;
     points_awarded:=reward;
   else points_awarded:=case when already then 0 else reward end;
   end if;
   milestone_key:=m; target:=target_value; return next;
 end loop;
end; $$;

grant execute on function public.refresh_contributor_milestones(uuid) to authenticated;
grant select on public.contributor_milestones to anon,authenticated;
