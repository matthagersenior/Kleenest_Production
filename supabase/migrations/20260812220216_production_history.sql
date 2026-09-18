create or replace function public.promotion_redemption_summary(p_promotion_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_p public.promotions; v_count integer; v_last timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_p from public.promotions where id=p_promotion_id and active=true;
 if not found then raise exception 'Promotion not found or inactive'; end if;
 select count(*), max(redeemed_at) into v_count,v_last from public.promotion_redemptions where promotion_id=p_promotion_id and user_id=auth.uid();
 return jsonb_build_object('promotion',to_jsonb(v_p),'user_redemptions',v_count,'last_redeemed_at',v_last);
end;
$$;
revoke execute on function public.promotion_redemption_summary(uuid) from public;
grant execute on function public.promotion_redemption_summary(uuid) to authenticated;
