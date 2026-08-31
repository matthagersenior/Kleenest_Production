create or replace function public.toggle_review_like(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  liked boolean;
  v_review_owner uuid;
  v_location_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select r.user_id, r.location_id
    into v_review_owner, v_location_id
  from public.reviews r
  where r.id = p_review_id
    and r.status = 'published';

  if v_review_owner is null then raise exception 'Review not found'; end if;

  if exists(select 1 from public.review_likes rl where rl.user_id = auth.uid() and rl.review_id = p_review_id) then
    delete from public.review_likes rl where rl.user_id = auth.uid() and rl.review_id = p_review_id;
    liked := false;
  else
    insert into public.review_likes(user_id, review_id) values(auth.uid(), p_review_id);
    liked := true;
    perform public.award_helpful_review_badges(v_review_owner);

    if v_review_owner <> auth.uid()
      and coalesce((select np.community from public.notification_preferences np where np.user_id = v_review_owner), true)
    then
      select coalesce(nullif(trim(p.display_name), ''), nullif(trim(p.username), ''), 'Someone')
        into v_actor_name
      from public.profiles p
      where p.id = auth.uid();

      insert into public.notifications(user_id, type, title, body, data)
      values(
        v_review_owner,
        'review_helpful',
        'Your review helped someone',
        coalesce(v_actor_name, 'Someone') || ' marked your review as helpful.',
        jsonb_build_object(
          'review_id', p_review_id,
          'location_id', v_location_id,
          'actor_user_id', auth.uid(),
          'type', 'review_helpful'
        )
      );
    end if;
  end if;

  return liked;
end;
$$;

revoke all on function public.toggle_review_like(uuid) from public, anon;
grant execute on function public.toggle_review_like(uuid) to authenticated;
