create or replace function public.award_helpful_review_badges(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path='public','auth','extensions','pg_temp'
as $$
declare
  v_helpful integer:=0;
  v_awarded integer:=0;
  b record;
  v_threshold integer;
  v_reward integer;
begin
  if p_user_id is null then return 0; end if;
  select count(*)::integer into v_helpful
  from public.review_likes l
  join public.reviews r on r.id=l.review_id
  where r.user_id=p_user_id and r.status='published' and l.user_id<>r.user_id;

  for b in
    select * from public.badges
    where criteria->>'type'='helpful_received' or criteria ? 'helpful'
  loop
    v_threshold:=coalesce((b.criteria->>'count')::integer,(b.criteria->>'helpful')::integer,0);
    if v_helpful>=v_threshold and not exists(select 1 from public.user_badges ub where ub.user_id=p_user_id and ub.badge_id=b.id) then
      insert into public.user_badges(user_id,badge_id) values(p_user_id,b.id) on conflict do nothing;
      if found then
        v_awarded:=v_awarded+1;
        v_reward:=greatest(coalesce((b.criteria->>'reward_points')::integer,0),0);
        if v_reward>0 then
          insert into public.point_transactions(user_id,points,reason,reference_id)
          values(p_user_id,v_reward,'badge_reward',b.id)
          on conflict (user_id,reason,reference_id) where reference_id is not null do nothing;
        end if;
      end if;
    end if;
  end loop;
  return v_awarded;
end;
$$;
revoke all on function public.award_helpful_review_badges(uuid) from public,anon,authenticated;
