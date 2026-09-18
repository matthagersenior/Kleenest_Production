create or replace function public.get_cross_tier_leaderboard(p_leaderboard_key text default 'consumer_checkins', p_limit integer default 25)
returns table(actor_id uuid, actor_type text, total_value numeric, rank bigint)
language sql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select actor_id, actor_type, sum(metric_value) as total_value,
         rank() over(order by sum(metric_value) desc) as rank
  from public.network_leaderboard_participation
  where leaderboard_key=p_leaderboard_key
  group by actor_id,actor_type
  order by total_value desc
  limit greatest(1,least(coalesce(p_limit,25),100));
$$;
