create or replace function public.review_rewards_summary(p_review_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare v_review public.reviews; v_profile public.profiles; v_tx jsonb; v_checkin jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_review from public.reviews where id=p_review_id and user_id=auth.uid();
 if not found then raise exception 'Review not found'; end if;
 select * into v_profile from public.profiles where id=auth.uid();
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_tx from (select id,points,reason,reference_id,created_at from public.point_transactions where user_id=auth.uid() and reference_id=p_review_id order by created_at desc limit 10) x;
 if v_review.check_in_id is not null then select to_jsonb(c) into v_checkin from public.check_ins c where c.id=v_review.check_in_id and c.user_id=auth.uid(); end if;
 return jsonb_build_object('review',to_jsonb(v_review),'check_in',v_checkin,'profile',jsonb_build_object('points',coalesce(v_profile.points,0),'level',coalesce(v_profile.level,1),'streak',coalesce(v_profile.streak,0),'total_check_ins',coalesce(v_profile.total_check_ins,0),'total_reviews',coalesce(v_profile.total_reviews,0)),'point_transactions',v_tx);
end;
$$;
revoke execute on function public.review_rewards_summary(uuid) from public;
grant execute on function public.review_rewards_summary(uuid) to authenticated;
