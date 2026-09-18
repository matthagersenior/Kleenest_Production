begin;
insert into public.contests(name,description,starts_at,ends_at,scoring_rules,rewards,status)
values
('Weekly Clean Cup','Earn points from verified check-ins, reviews and community activity.','2026-08-10T00:00:00Z','2026-08-17T00:00:00Z','{"mode":"points"}','{"badge":"contest-champion","points":100}','active'),
('Community Explorer','Discover and review previously unrated locations.','2026-08-13T00:00:00Z','2026-08-31T23:59:59Z','{"mode":"exploration","first_review_points":25}','{"badge":"explorer","points":75}','active'),
('Clean Business Challenge','Businesses compete on verified cleanliness and review engagement.','2026-08-13T00:00:00Z','2026-09-15T23:59:59Z','{"mode":"business","cleanliness_weight":0.7,"engagement_weight":0.3}','{"badge":"contest-champion","featured_days":30}','active')
 on conflict do nothing;
create or replace function public.gamification_dashboard()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); total integer; lvl record; streak record;
begin
 if u is null then raise exception 'Authentication required'; end if;
 select coalesce(sum(points),0)::int into total from public.point_transactions where user_id=u;
 select * into lvl from public.level_definitions where min_points<=total and (max_points is null or total<=max_points) order by level desc limit 1;
 select * into streak from public.user_streaks where user_id=u;
 return jsonb_build_object(
  'points',total,
  'level',coalesce(lvl.level,1),
  'level_name',coalesce(lvl.name,'Newcomer'),
  'next_level_points',coalesce((select min_points from public.level_definitions where level=coalesce(lvl.level,1)+1),null),
  'current_streak',coalesce(streak.current_streak,0),
  'longest_streak',coalesce(streak.longest_streak,0),
  'badges',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'icon',b.icon) order by b.name),'[]'::jsonb) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=u),
  'contests',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'starts_at',c.starts_at,'ends_at',c.ends_at,'status',c.status) order by c.ends_at),'[]'::jsonb) from public.contests c where c.status in ('scheduled','active'))
 );
end $$;
revoke all on function public.gamification_dashboard() from public,anon; grant execute on function public.gamification_dashboard() to authenticated;
commit;
