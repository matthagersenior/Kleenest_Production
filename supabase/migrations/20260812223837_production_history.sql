create or replace function public.user_rewards_history(p_limit integer default 50)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,50),1),100); v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 return jsonb_build_object(
  'transactions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select id,points,reason,reference_id,created_at from public.point_transactions where user_id=v_uid order by created_at desc limit v_limit) x),
  'badges',(select coalesce(jsonb_agg(to_jsonb(x) order by x.earned_at desc),'[]'::jsonb) from (select ub.badge_id,ub.earned_at,b.code,b.name,b.description,b.icon,b.criteria from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=v_uid order by ub.earned_at desc limit v_limit) x),
  'profile',(select to_jsonb(p) from public.profiles p where p.id=v_uid)
 );
end; $$;
revoke execute on function public.user_rewards_history(integer) from public; grant execute on function public.user_rewards_history(integer) to authenticated;
