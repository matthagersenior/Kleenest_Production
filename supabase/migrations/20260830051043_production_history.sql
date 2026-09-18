grant execute on function public.record_enterprise_partner_campaign_outcome(uuid,uuid,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) to authenticated;
revoke all on function public.record_enterprise_partner_campaign_outcome(uuid,uuid,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) from public, anon;

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
    select 1
    from public.business_members bm
    join public.businesses b on b.id=bm.business_id
    where bm.business_id=p_business_id
      and bm.user_id=auth.uid()
      and bm.role in ('owner','admin')
      and lower(b.business_tier::text) in ('enterprise','fleet')
  ) then raise exception 'Enterprise or Fleet admin access required'; end if;

  with owned_networks as (
    select n.id,n.name,n.enabled,n.created_at
    from public.enterprise_partner_networks n
    where n.owner_business_id=p_business_id
  ), network_rollup as (
    select
      n.id,
      count(distinct m.id) filter (where m.status='active')::bigint as active_members,
      count(distinct c.id)::bigint as campaigns,
      count(distinct c.id) filter (where c.status='active')::bigint as active_campaigns,
      coalesce(sum(x.visits),0)::bigint as visits,
      coalesce(sum(x.check_ins),0)::bigint as check_ins,
      coalesce(sum(x.reviews),0)::bigint as reviews,
      coalesce(sum(x.preferred_uses),0)::bigint as preferred_uses,
      coalesce(sum(x.access_redemptions),0)::bigint as access_redemptions,
      coalesce(sum(x.promotion_redemptions),0)::bigint as promotion_redemptions
    from owned_networks n
    left join public.enterprise_partner_network_members m on m.network_id=n.id
    left join public.enterprise_partner_campaigns c on c.network_id=n.id
    left join public.enterprise_partner_network_metrics x on x.network_id=n.id and x.metric_date between v_start and current_date
    group by n.id
  ), campaign_outcome_rollup as (
    select
      c.network_id,
      coalesce(sum(o.attributed_users),0)::bigint as attributed_users,
      coalesce(sum(o.points_awarded),0)::bigint as points_awarded
    from public.enterprise_partner_campaigns c
    join owned_networks n on n.id=c.network_id
    left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id and o.metric_date between v_start and current_date
    group by c.network_id
  )
  select jsonb_build_object(
    'business_id',p_business_id,
    'window_days',v_days,
    'start_date',v_start,
    'end_date',current_date,
    'totals',jsonb_build_object(
      'networks',count(*)::bigint,
      'enabled_networks',count(*) filter (where n.enabled)::bigint,
      'active_members',coalesce(sum(r.active_members),0)::bigint,
      'campaigns',coalesce(sum(r.campaigns),0)::bigint,
      'active_campaigns',coalesce(sum(r.active_campaigns),0)::bigint,
      'visits',coalesce(sum(r.visits),0)::bigint,
      'check_ins',coalesce(sum(r.check_ins),0)::bigint,
      'reviews',coalesce(sum(r.reviews),0)::bigint,
      'preferred_uses',coalesce(sum(r.preferred_uses),0)::bigint,
      'access_redemptions',coalesce(sum(r.access_redemptions),0)::bigint,
      'promotion_redemptions',coalesce(sum(r.promotion_redemptions),0)::bigint,
      'attributed_users',coalesce(sum(o.attributed_users),0)::bigint,
      'points_awarded',coalesce(sum(o.points_awarded),0)::bigint
    ),
    'networks',coalesce(jsonb_agg(jsonb_build_object(
      'id',n.id,'name',n.name,'enabled',n.enabled,'created_at',n.created_at,
      'active_members',coalesce(r.active_members,0),
      'campaigns',coalesce(r.campaigns,0),
      'active_campaigns',coalesce(r.active_campaigns,0),
      'visits',coalesce(r.visits,0),
      'check_ins',coalesce(r.check_ins,0),
      'reviews',coalesce(r.reviews,0),
      'preferred_uses',coalesce(r.preferred_uses,0),
      'access_redemptions',coalesce(r.access_redemptions,0),
      'promotion_redemptions',coalesce(r.promotion_redemptions,0),
      'attributed_users',coalesce(o.attributed_users,0),
      'points_awarded',coalesce(o.points_awarded,0)
    ) order by n.created_at desc),'[]'::jsonb),
    'generated_at',now()
  ) into v_result
  from owned_networks n
  left join network_rollup r on r.id=n.id
  left join campaign_outcome_rollup o on o.network_id=n.id;

  return coalesce(v_result,jsonb_build_object(
    'business_id',p_business_id,'window_days',v_days,'start_date',v_start,'end_date',current_date,
    'totals',jsonb_build_object('networks',0,'enabled_networks',0,'active_members',0,'campaigns',0,'active_campaigns',0,'visits',0,'check_ins',0,'reviews',0,'preferred_uses',0,'access_redemptions',0,'promotion_redemptions',0,'attributed_users',0,'points_awarded',0),
    'networks','[]'::jsonb,'generated_at',now()
  ));
end;
$$;

revoke all on function public.enterprise_control_plane_snapshot(uuid,integer) from public, anon;
grant execute on function public.enterprise_control_plane_snapshot(uuid,integer) to authenticated;
