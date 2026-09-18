create or replace function public.promotion_redemption_rewards_summary(p_redemption_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare v_redemption public.promotion_redemptions; v_promotion public.promotions; v_profile public.profiles;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_redemption from public.promotion_redemptions where id=p_redemption_id and user_id=auth.uid();
 if not found then raise exception 'Redemption not found'; end if;
 select * into v_promotion from public.promotions where id=v_redemption.promotion_id;
 select * into v_profile from public.profiles where id=auth.uid();
 return jsonb_build_object('redemption',to_jsonb(v_redemption),'promotion',to_jsonb(v_promotion),'profile',jsonb_build_object('id',v_profile.id,'points',v_profile.points,'level',v_profile.level,'streak',v_profile.streak,'total_check_ins',v_profile.total_check_ins,'total_reviews',v_profile.total_reviews),'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.point_transactions t where t.user_id=auth.uid() and t.reference_id=p_redemption_id),'[]'::jsonb));
end;
$$;
revoke execute on function public.promotion_redemption_rewards_summary(uuid) from public,anon;
grant execute on function public.promotion_redemption_rewards_summary(uuid) to authenticated;
