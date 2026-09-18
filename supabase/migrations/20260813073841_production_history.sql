begin;
create table if not exists public.level_definitions (
  level integer primary key,
  name text not null,
  min_points integer not null check (min_points >= 0),
  max_points integer,
  perks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (max_points is null or max_points >= min_points)
);
create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date date,
  streak_started_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.review_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, review_id)
);
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  scoring_rules jsonb not null default '{}'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','active','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (contest_id, user_id)
);
create index if not exists contests_window_idx on public.contests(starts_at, ends_at, status);
create index if not exists contest_entries_user_idx on public.contest_entries(user_id);
create index if not exists review_likes_review_idx on public.review_likes(review_id);
create unique index if not exists point_transactions_event_unique on public.point_transactions(user_id, reason, reference_id) where reference_id is not null;
insert into public.level_definitions(level,name,min_points,max_points,perks) values
(1,'Newcomer',0,99,'{}'),(2,'Explorer',100,249,'{"badge_slots":1}'),(3,'Regular',250,499,'{"badge_slots":2}'),(4,'Local Guide',500,999,'{"badge_slots":3}'),(5,'Community Champion',1000,1999,'{"badge_slots":4}'),(6,'Kleenest Legend',2000,null,'{"badge_slots":5}')
on conflict (level) do update set name=excluded.name,min_points=excluded.min_points,max_points=excluded.max_points,perks=excluded.perks;
insert into public.badges(code,name,description,icon,criteria) values
('first-checkin','First Check-In','Complete your first verified check-in.','checkin','{"type":"check_ins","count":1}'),
('reviewer','Reviewer','Publish your first review.','review','{"type":"reviews","count":1}'),
('community-helper','Community Helper','Earn community contribution points.','community','{"type":"points","count":100}'),
('week-streak','Week Streak','Maintain a 7-day activity streak.','streak','{"type":"streak","count":7}'),
('month-streak','Month Streak','Maintain a 30-day activity streak.','streak','{"type":"streak","count":30}'),
('explorer','Explorer','Check in at 10 distinct locations.','explorer','{"type":"distinct_locations","count":10}'),
('contest-champion','Contest Champion','Finish first in a completed contest.','trophy','{"type":"contest_wins","count":1}')
on conflict (code) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,criteria=excluded.criteria;
create or replace view public.community_leaderboard as
select p.id,p.display_name,p.username,p.avatar_url,p.points,p.level,p.streak,p.total_check_ins,p.total_reviews,
 row_number() over(order by p.points desc, p.total_check_ins desc, p.total_reviews desc, p.id) as rank
from public.profiles p where coalesce(p.is_demo_test,false)=false;
create or replace function public.toggle_review_like(p_review_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare liked boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if exists(select 1 from public.review_likes where user_id=auth.uid() and review_id=p_review_id) then
   delete from public.review_likes where user_id=auth.uid() and review_id=p_review_id;
   liked:=false;
 else
   insert into public.review_likes(user_id,review_id) values(auth.uid(),p_review_id);
   liked:=true;
 end if;
 return liked;
end $$;
create or replace function public.join_contest(p_contest_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.contests;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into c from public.contests where id=p_contest_id;
 if not found or c.status not in ('scheduled','active') or now() > c.ends_at then raise exception 'Contest is not open'; end if;
 insert into public.contest_entries(contest_id,user_id) values(p_contest_id,auth.uid()) on conflict do nothing;
 return true;
end $$;
create or replace function public.record_gamification_activity(p_activity text,p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); today date:=current_date; s public.user_streaks; pts integer:=0; new_level integer; new_streak integer; awarded boolean:=false;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select * into s from public.user_streaks where user_id=u for update;
 if not found then insert into public.user_streaks(user_id,current_streak,longest_streak,last_activity_date,streak_started_at) values(u,1,1,today,now()) returning * into s; else
   if s.last_activity_date=today then new_streak:=s.current_streak;
   elsif s.last_activity_date=today-1 then new_streak:=s.current_streak+1;
   else new_streak:=1; end if;
   update public.user_streaks set current_streak=new_streak,longest_streak=greatest(longest_streak,new_streak),last_activity_date=today,streak_started_at=case when new_streak=1 then now() else streak_started_at end,updated_at=now() where user_id=u returning * into s;
 end if;
 pts:=case p_activity when 'check_in' then 10 when 'review' then 20 when 'review_like_received' then 2 when 'community' then 5 else 1 end;
 if s.current_streak >= 7 then pts:=pts+5; end if;
 insert into public.point_transactions(user_id,points,reason,reference_id) values(u,pts,p_activity,p_reference_id) on conflict (user_id,reason,reference_id) where reference_id is not null do nothing;
 select coalesce(sum(points),0) into pts from public.point_transactions where user_id=u;
 select level into new_level from public.level_definitions where min_points <= pts and (max_points is null or pts <= max_points) order by level desc limit 1;
 update public.profiles set points=pts,level=coalesce(new_level,1),streak=s.current_streak,updated_at=now() where id=u;
 return jsonb_build_object('points',pts,'level',coalesce(new_level,1),'current_streak',s.current_streak,'longest_streak',s.longest_streak);
end $$;
create or replace function public.contest_score(p_contest_id uuid,p_user_id uuid)
returns integer language sql stable security invoker as $$
select coalesce(sum(pt.points),0)::integer from public.point_transactions pt join public.contests c on c.id=p_contest_id where pt.user_id=p_user_id and pt.created_at>=c.starts_at and pt.created_at<=c.ends_at;$$;
create or replace view public.contest_leaderboards as
select ce.contest_id,ce.user_id,p.display_name,p.username,p.avatar_url,public.contest_score(ce.contest_id,ce.user_id) as score,
 row_number() over(partition by ce.contest_id order by public.contest_score(ce.contest_id,ce.user_id) desc,ce.joined_at) as rank
from public.contest_entries ce join public.profiles p on p.id=ce.user_id;
alter table public.user_streaks enable row level security;
alter table public.review_likes enable row level security;
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
drop policy if exists user_streaks_owner on public.user_streaks; create policy user_streaks_owner on public.user_streaks for select to authenticated using(user_id=auth.uid());
drop policy if exists review_likes_read on public.review_likes; create policy review_likes_read on public.review_likes for select to authenticated using(true);
drop policy if exists review_likes_write on public.review_likes; create policy review_likes_write on public.review_likes for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists contests_read on public.contests; create policy contests_read on public.contests for select to authenticated using(status in ('scheduled','active','completed') or created_by=auth.uid());
drop policy if exists contest_entries_owner on public.contest_entries; create policy contest_entries_owner on public.contest_entries for select to authenticated using(user_id=auth.uid());
revoke all on function public.toggle_review_like(uuid) from public,anon; grant execute on function public.toggle_review_like(uuid) to authenticated;
revoke all on function public.join_contest(uuid) from public,anon; grant execute on function public.join_contest(uuid) to authenticated;
revoke all on function public.record_gamification_activity(text,uuid) from public,anon; grant execute on function public.record_gamification_activity(text,uuid) to authenticated;
revoke all on function public.contest_score(uuid,uuid) from public,anon; grant execute on function public.contest_score(uuid,uuid) to authenticated;
commit;
