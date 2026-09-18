begin;
create or replace function public.evaluate_user_badges(p_user_id uuid default auth.uid())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare awarded_count integer:=0; checkins integer; reviews integer; distinct_locations integer; pts integer; streak integer; b record;
begin
 if p_user_id is null then raise exception 'Authentication required'; end if;
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Not authorized'; end if;
 select count(*) into checkins from public.check_ins where user_id=p_user_id;
 select count(*) into reviews from public.reviews where user_id=p_user_id and status='published';
 select count(distinct location_id) into distinct_locations from public.check_ins where user_id=p_user_id;
 select coalesce(sum(points),0) into pts from public.point_transactions where user_id=p_user_id;
 select coalesce(current_streak,0) into streak from public.user_streaks where user_id=p_user_id;
 for b in select * from public.badges loop
   if (b.criteria->>'type')='check_ins' and checkins >= coalesce((b.criteria->>'count')::int,0)
      or (b.criteria->>'type')='reviews' and reviews >= coalesce((b.criteria->>'count')::int,0)
      or (b.criteria->>'type')='distinct_locations' and distinct_locations >= coalesce((b.criteria->>'count')::int,0)
      or (b.criteria->>'type')='points' and pts >= coalesce((b.criteria->>'count')::int,0)
      or (b.criteria->>'type')='streak' and streak >= coalesce((b.criteria->>'count')::int,0)
   then
     insert into public.user_badges(user_id,badge_id) values(p_user_id,b.id) on conflict do nothing;
     if found then awarded_count:=awarded_count+1; end if;
   end if;
 end loop;
 return awarded_count;
end $$;
create or replace function public.create_contest(p_name text,p_description text,p_starts_at timestamptz,p_ends_at timestamptz,p_scoring_rules jsonb default '{}'::jsonb,p_rewards jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid; admin boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select coalesce(is_admin,false) into admin from public.profiles where id=auth.uid();
 if not admin then raise exception 'Administrator access required'; end if;
 insert into public.contests(name,description,starts_at,ends_at,scoring_rules,rewards,status,created_by) values(p_name,p_description,p_starts_at,p_ends_at,p_scoring_rules,p_rewards,'scheduled',auth.uid()) returning id into cid;
 return cid;
end $$;
create or replace function public.contest_score(p_contest_id uuid,p_user_id uuid)
returns integer language sql stable security invoker as $$
select coalesce(sum(
 case
   when (c.scoring_rules->>'check_in_points') is not null and pt.reason='check_in' then pt.points
   when (c.scoring_rules->>'review_points') is not null and pt.reason='review' then pt.points
   when coalesce(c.scoring_rules->>'mode','points')='points' then pt.points
   else 0 end),0)::integer
from public.point_transactions pt join public.contests c on c.id=p_contest_id
where pt.user_id=p_user_id and pt.created_at>=c.starts_at and pt.created_at<=c.ends_at;
$$;
revoke all on function public.evaluate_user_badges(uuid) from public,anon; grant execute on function public.evaluate_user_badges(uuid) to authenticated;
revoke all on function public.create_contest(text,text,timestamptz,timestamptz,jsonb,jsonb) from public,anon; grant execute on function public.create_contest(text,text,timestamptz,timestamptz,jsonb,jsonb) to authenticated;
-- Social tables are owner-safe and explicitly RLS enabled.
alter table public.favorites enable row level security;
alter table public.follows enable row level security;
alter table public.family_groups enable row level security;
alter table public.family_members enable row level security;
drop policy if exists favorites_owner on public.favorites; create policy favorites_owner on public.favorites for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists follows_read on public.follows; create policy follows_read on public.follows for select to authenticated using(true);
drop policy if exists follows_owner on public.follows; create policy follows_owner on public.follows for all to authenticated using(follower_id=auth.uid()) with check(follower_id=auth.uid() and follower_id<>following_id);
drop policy if exists family_groups_owner on public.family_groups; create policy family_groups_owner on public.family_groups for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists family_members_access on public.family_members; create policy family_members_access on public.family_members for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.family_groups g where g.id=group_id and g.owner_id=auth.uid()));
drop policy if exists family_members_owner on public.family_members; create policy family_members_owner on public.family_members for all to authenticated using(exists(select 1 from public.family_groups g where g.id=group_id and g.owner_id=auth.uid())) with check(exists(select 1 from public.family_groups g where g.id=group_id and g.owner_id=auth.uid()));
commit;
