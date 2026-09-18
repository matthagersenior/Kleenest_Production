create or replace function public.business_dashboard_secure_summary(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) and not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then raise exception 'Not authorized for this business'; end if;
 select jsonb_build_object(
   'business',(select to_jsonb(b) from public.businesses b where b.id=p_business_id),
   'locations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at),'[]'::jsonb) from public.locations l where l.business_id=p_business_id),
   'summary',(select coalesce(jsonb_object_agg(x.event_type,x.event_count),'{}'::jsonb) from public.business_dashboard_summary(p_business_id,p_start,p_end) x),
   'reviews',(select count(*) from public.reviews r join public.locations l on l.id=r.location_id where l.business_id=p_business_id and r.created_at between p_start and p_end),
   'check_ins',(select count(*) from public.check_ins c join public.locations l on l.id=c.location_id where l.business_id=p_business_id and c.checked_in_at between p_start and p_end),
   'redemptions',(select count(*) from public.promotion_redemptions pr join public.locations l on l.id=pr.location_id where l.business_id=p_business_id and pr.redeemed_at between p_start and p_end)
 ) into v_result;
 return v_result;
end;
$$;
revoke execute on function public.business_dashboard_secure_summary(uuid,timestamptz,timestamptz) from public;
grant execute on function public.business_dashboard_secure_summary(uuid,timestamptz,timestamptz) to authenticated;
