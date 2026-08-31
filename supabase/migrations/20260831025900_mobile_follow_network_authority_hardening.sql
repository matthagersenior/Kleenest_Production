create or replace function public.list_following_users(p_limit integer default 100)
returns table(following_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.following_id, f.created_at
  from public.follows f
  where f.follower_id = auth.uid()
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;

create or replace function public.list_follower_users(p_limit integer default 100)
returns table(follower_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.follower_id, f.created_at
  from public.follows f
  where f.following_id = auth.uid()
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;

revoke all on function public.list_following_users(integer) from public, anon;
revoke all on function public.list_follower_users(integer) from public, anon;
grant execute on function public.list_following_users(integer) to authenticated;
grant execute on function public.list_follower_users(integer) to authenticated;
