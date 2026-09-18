create or replace function public.get_progression_summary()
returns jsonb
language sql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
    'streak',coalesce((select s.current_streak from public.user_streaks s where s.user_id=auth.uid()),0),
    'streak_details',(select to_jsonb(s) from public.user_streaks s where s.user_id=auth.uid()),
    'badges',(select coalesce(jsonb_agg(to_jsonb(x) order by x.earned_at desc),'[]'::jsonb) from (select ub.earned_at,b.* from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=auth.uid()) x),
    'user_leaderboard',(select coalesce(jsonb_agg(to_jsonb(x) order by x.rank),'[]'::jsonb) from (select * from public.community_leaderboard order by rank limit 25) x)
  );
$$;
