create or replace function public.list_following_users(p_limit integer default 100)
returns table(following_id uuid, created_at timestamptz)
language sql stable security invoker
set search_path = public
as $$
  select f.following_id, f.created_at
  from public.follows f
  where f.follower_id = auth.uid()
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;

create or replace function public.is_following_user(p_target_user_id uuid)
returns boolean
language sql stable security invoker
set search_path = public
as $$
  select exists(
    select 1 from public.follows f
    where f.follower_id = auth.uid()
      and f.following_id = p_target_user_id
  );
$$;

create or replace function public.unfollow_user(p_target_user_id uuid)
returns boolean
language plpgsql security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if p_target_user_id is null or p_target_user_id = auth.uid() then raise exception 'A different user is required.'; end if;
  delete from public.follows where follower_id = auth.uid() and following_id = p_target_user_id;
  return found;
end;
$$;

grant execute on function public.list_following_users(integer) to authenticated;
grant execute on function public.is_following_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;

insert into public.capability_function_classifications(function_signature,domain,classification,rationale,updated_at)
values
('list_following_users(p_limit integer)','community','canonical','Canonical authenticated following read contract; avoids direct protected-table reads.','now'),
('is_following_user(p_target_user_id uuid)','community','canonical','Canonical authenticated relationship-state read contract.','now'),
('unfollow_user(p_target_user_id uuid)','community','canonical','Canonical authenticated relationship mutation; constrains actor to auth.uid().','now')
on conflict(function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale,updated_at=excluded.updated_at;
