create or replace function public.enterprise_control_plane_snapshot(
  p_business_id uuid,
  p_window_days integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_window_days,30), 365));
  v_start date := current_date - (greatest(1, least(coalesce(p_window_days,30),365)) - 1);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.business_members bm
    join public.businesses b on b.id=bm.business_id
    where bm.business_id=p_business_id and bm.user_id=auth.uid()
      and bm.role in ('owner','admin') and lower(b.business_tier::text) in ('enterprise','fleet')
  ) then raise exception 'Enterprise or Fleet admin access required'; end if;

  with owned_networks as (
    select n.id,n.name,n.enabled,n.created_at
    from public.enterprise_partner_networks n where n.owner_business_id=p_business_id
  ), member_rollup as (
    select m.network_id,count(*) filter(where m.status='active')::bigint active_members
    from public.enterprise_partner_network_members m join owned_networks n on n.id=m.network_id group by m.network_id
  ), campaign_rollup as (
    select c.network_id,count(*)::bigint campaigns,count(*) filter(where c.status='active')::bigint active_campaigns
    from public.enterprise_partner_campaigns c join owned_networks n on n.id=c.network_id group by c.network_id
  ), metric_rollup as (
    select x.network_id,coalesce(sum(x.visits),0)::bigint visits,coalesce(sum(x.check_ins),0)::bigint check_ins,
      coalesce(sum(x.reviews),0)::bigint reviews,coalesce(sum(x.preferred_uses),0)::bigint preferred_uses,
      coalesce(sum(x.access_redemptions),0)::bigint access_redemptions,coalesce(sum(x.promotion_redemptions),0)::bigint promotion_redemptions
    from public.enterprise_partner_network_metrics x join owned_networks n on n.id=x.network_id
    where x.metric_date between v_start and current_date group by x.network_id
  ), outcome_rollup as (
    select c.network_id,coalesce(sum(o.attributed_users),0)::bigint attributed_users,coalesce(sum(o.points_awarded),0)::bigint points_awarded
    from public.enterprise_partner_campaigns c join owned_networks n on n.id=c.network_id
    left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id and o.metric_date between v_start and current_date
    group by c.network_id
  )
  select jsonb_build_object(
    'business_id',p_business_id,'window_days',v_days,'start_date',v_start,'end_date',current_date,
    'totals',jsonb_build_object(
      'networks',count(*)::bigint,'enabled_networks',count(*) filter(where n.enabled)::bigint,
      'active_members',coalesce(sum(m.active_members),0)::bigint,'campaigns',coalesce(sum(c.campaigns),0)::bigint,
      'active_campaigns',coalesce(sum(c.active_campaigns),0)::bigint,'visits',coalesce(sum(x.visits),0)::bigint,
      'check_ins',coalesce(sum(x.check_ins),0)::bigint,'reviews',coalesce(sum(x.reviews),0)::bigint,
      'preferred_uses',coalesce(sum(x.preferred_uses),0)::bigint,'access_redemptions',coalesce(sum(x.access_redemptions),0)::bigint,
      'promotion_redemptions',coalesce(sum(x.promotion_redemptions),0)::bigint,'attributed_users',coalesce(sum(o.attributed_users),0)::bigint,
      'points_awarded',coalesce(sum(o.points_awarded),0)::bigint),
    'networks',coalesce(jsonb_agg(jsonb_build_object(
      'id',n.id,'name',n.name,'enabled',n.enabled,'created_at',n.created_at,
      'active_members',coalesce(m.active_members,0),'campaigns',coalesce(c.campaigns,0),'active_campaigns',coalesce(c.active_campaigns,0),
      'visits',coalesce(x.visits,0),'check_ins',coalesce(x.check_ins,0),'reviews',coalesce(x.reviews,0),
      'preferred_uses',coalesce(x.preferred_uses,0),'access_redemptions',coalesce(x.access_redemptions,0),
      'promotion_redemptions',coalesce(x.promotion_redemptions,0),'attributed_users',coalesce(o.attributed_users,0),'points_awarded',coalesce(o.points_awarded,0)
    ) order by n.created_at desc),'[]'::jsonb),'generated_at',now()) into v_result
  from owned_networks n
  left join member_rollup m on m.network_id=n.id
  left join campaign_rollup c on c.network_id=n.id
  left join metric_rollup x on x.network_id=n.id
  left join outcome_rollup o on o.network_id=n.id;

  return coalesce(v_result,jsonb_build_object(
    'business_id',p_business_id,'window_days',v_days,'start_date',v_start,'end_date',current_date,
    'totals',jsonb_build_object('networks',0,'enabled_networks',0,'active_members',0,'campaigns',0,'active_campaigns',0,'visits',0,'check_ins',0,'reviews',0,'preferred_uses',0,'access_redemptions',0,'promotion_redemptions',0,'attributed_users',0,'points_awarded',0),
    'networks','[]'::jsonb,'generated_at',now()));
end;
$$;
revoke all on function public.enterprise_control_plane_snapshot(uuid,integer) from public, anon;
grant execute on function public.enterprise_control_plane_snapshot(uuid,integer) to authenticated;
