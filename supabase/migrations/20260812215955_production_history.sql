create or replace function public.checkin_rewards_summary(p_checkin_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_checkin public.check_ins%rowtype;
  v_profile public.profiles%rowtype;
  v_tx jsonb;
  v_badges jsonb;
begin
  select * into v_checkin from public.check_ins where id = p_checkin_id and user_id = auth.uid();
  if not found then raise exception 'Check-in not found'; end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_tx
  from (select id, points, reason, reference_id, created_at from public.point_transactions where user_id=auth.uid() and (reference_id=p_checkin_id or created_at >= v_checkin.checked_in_at - interval '1 minute') order by created_at desc limit 20) x;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_badges
  from (select ub.badge_id, ub.earned_at from public.user_badges ub where ub.user_id=auth.uid() and ub.earned_at >= v_checkin.checked_in_at - interval '1 minute') x;

  return jsonb_build_object('check_in',to_jsonb(v_checkin),'profile',jsonb_build_object('points',v_profile.points,'level',v_profile.level,'streak',v_profile.streak,'total_check_ins',v_profile.total_check_ins,'total_reviews',v_profile.total_reviews),'point_transactions',v_tx,'new_badges',v_badges);
end;
$$;
revoke execute on function public.checkin_rewards_summary(uuid) from public;
grant execute on function public.checkin_rewards_summary(uuid) to authenticated;
