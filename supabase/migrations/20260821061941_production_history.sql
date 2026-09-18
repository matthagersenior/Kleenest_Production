revoke all on function public.get_business_dashboard() from public, anon;
grant execute on function public.get_business_dashboard() to authenticated;

revoke all on function public.business_summary_analytics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.business_summary_analytics(uuid, timestamptz, timestamptz) to authenticated;

revoke all on function public.business_promotion_detail(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.business_promotion_detail(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.business_promotion_detail(p_business_id uuid, p_start timestamptz default now() - interval '30 days', p_end timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id)
     and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='analyst')
  then raise exception 'Not authorized for this business'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into out
  from (
    select p.id,p.title,p.description,p.discount,p.active,p.starts_at,p.ends_at,p.created_at,l.name location,
      count(ae.id) filter(where ae.event_type='promotion_view' and ae.created_at between p_start and p_end) views,
      count(ae.id) filter(where ae.event_type='promotion_redeemed' and ae.created_at between p_start and p_end) redemptions
    from promotions p
    left join locations l on l.id=p.location_id
    left join analytics_events ae on ae.promotion_id=p.id
    where p.business_id=p_business_id
    group by p.id,p.title,p.description,p.discount,p.active,p.starts_at,p.ends_at,p.created_at,l.name
  ) x;
  return out;
end;
$$;

revoke all on function public.business_promotion_detail(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.business_promotion_detail(uuid, timestamptz, timestamptz) to authenticated;

grant execute on function public.fleet_dashboard_summary_v2(uuid) to authenticated;
grant execute on function public.fleet_service_opportunities_for_business(uuid) to authenticated;
grant execute on function public.has_fleet_access(uuid) to authenticated;
