create or replace function public.community_contributor_summaries(p_user_ids uuid[])
returns table(
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  points integer,
  level integer,
  streak integer,
  total_check_ins integer,
  total_reviews integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(cardinality(p_user_ids), 0) > 100 then
    raise exception 'A maximum of 100 contributor ids may be requested';
  end if;

  return query
  select p.id, p.display_name, p.username, p.avatar_url, p.bio,
         p.points, p.level, p.streak, p.total_check_ins, p.total_reviews
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) with ordinality requested(user_id, ord)
  join public.profiles p on p.id = requested.user_id
  where coalesce(p.is_demo_test, false) = false
  order by requested.ord;
end;
$$;

revoke all on function public.community_contributor_summaries(uuid[]) from public, anon;
grant execute on function public.community_contributor_summaries(uuid[]) to authenticated;

drop policy if exists "users can insert their own profile" on public.profiles;
drop policy if exists "users can read their own profile" on public.profiles;
drop policy if exists "users can update their own profile" on public.profiles;
