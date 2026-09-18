create or replace function public.get_partner_campaign_roi(p_campaign_id uuid,p_start date default current_date - 30,p_end date default current_date) returns table(partner_business_id uuid,visits bigint,check_ins bigint,reviews bigint,preferred_uses bigint,access_redemptions bigint,promotion_redemptions bigint,attributed_users bigint,points_awarded bigint,engagement_score numeric,conversion_rate numeric) language sql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
select o.partner_business_id,sum(o.visits),sum(o.check_ins),sum(o.reviews),sum(o.preferred_uses),sum(o.access_redemptions),sum(o.promotion_redemptions),sum(o.attributed_users),sum(o.points_awarded),round((sum(o.check_ins)*.25+sum(o.reviews)*.15+sum(o.preferred_uses)*.2+sum(o.access_redemptions)*.2+sum(o.promotion_redemptions)*.2)::numeric,2),round(case when sum(o.visits)>0 then sum(o.check_ins)::numeric/sum(o.visits)*100 else 0 end,2)
from public.enterprise_partner_campaign_outcomes o
join public.enterprise_partner_campaigns c on c.id=o.campaign_id
join public.enterprise_partner_networks n on n.id=c.network_id
join public.businesses b on b.id=n.owner_business_id
where o.campaign_id=p_campaign_id and o.metric_date between p_start and p_end
  and exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))
  and lower(b.business_tier::text) in ('fleet','enterprise')
group by o.partner_business_id
order by round((sum(o.check_ins)*.25+sum(o.reviews)*.15+sum(o.preferred_uses)*.2+sum(o.access_redemptions)*.2+sum(o.promotion_redemptions)*.2)::numeric,2) desc;
$$;

create or replace function public.get_partner_allocation_roi(p_network_id uuid,p_start date default current_date - 30,p_end date default current_date) returns table(partner_business_id uuid,allocation_type text,allocated_budget_cents bigint,outcome_value bigint,efficiency numeric) language sql security definer set search_path to 'public','auth','extensions','pg_temp' as $$
select a.partner_business_id,a.allocation_type,sum(a.budget_cents)::bigint,sum(coalesce(o.check_ins,0)+coalesce(o.preferred_uses,0)+coalesce(o.access_redemptions,0)+coalesce(o.promotion_redemptions,0))::bigint,case when sum(a.budget_cents)>0 then round((sum(coalesce(o.check_ins,0)+coalesce(o.preferred_uses,0)+coalesce(o.access_redemptions,0)+coalesce(o.promotion_redemptions,0))::numeric*100)/sum(a.budget_cents),4) else 0 end
from public.enterprise_partner_allocations a
left join public.enterprise_partner_campaigns c on c.id=a.campaign_id
left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id and o.partner_business_id=a.partner_business_id and o.metric_date between p_start and p_end
join public.enterprise_partner_networks n on n.id=a.network_id
join public.businesses b on b.id=n.owner_business_id
where a.network_id=p_network_id and a.status in('active','completed')
  and exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))
  and lower(b.business_tier::text) in ('fleet','enterprise')
group by a.partner_business_id,a.allocation_type;
$$;

revoke all on function public.get_partner_campaign_roi(uuid,date,date) from public,anon;
grant execute on function public.get_partner_campaign_roi(uuid,date,date) to authenticated;
revoke all on function public.get_partner_allocation_roi(uuid,date,date) from public,anon;
grant execute on function public.get_partner_allocation_roi(uuid,date,date) to authenticated;
