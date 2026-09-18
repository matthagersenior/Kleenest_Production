create or replace function public.get_enterprise_partner_network(p_network_id uuid, p_start date default (current_date - 30), p_end date default current_date)
returns table(network_id uuid, network_name text, partner_count bigint, visits bigint, check_ins bigint, reviews bigint, preferred_uses bigint, access_redemptions bigint, promotion_redemptions bigint)
language sql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
  select n.id,
         n.name,
         count(distinct m.partner_business_id),
         coalesce(sum(x.visits),0),
         coalesce(sum(x.check_ins),0),
         coalesce(sum(x.reviews),0),
         coalesce(sum(x.preferred_uses),0),
         coalesce(sum(x.access_redemptions),0),
         coalesce(sum(x.promotion_redemptions),0)
  from public.enterprise_partner_networks n
  left join public.enterprise_partner_network_members m
    on m.network_id=n.id and m.status='active'
  left join public.enterprise_partner_network_metrics x
    on x.network_id=n.id and x.metric_date between p_start and p_end
  where n.id=p_network_id
    and exists (
      select 1
      from public.business_members bm
      join public.businesses b on b.id=bm.business_id
      where bm.user_id=auth.uid()
        and bm.business_id=n.owner_business_id
        and bm.role in ('owner','admin')
        and lower(b.business_tier::text) in ('fleet','enterprise')
    )
  group by n.id,n.name
$$;

create or replace function public.create_partner_allocation(p_network_id uuid, p_partner_business_id uuid, p_campaign_id uuid, p_type text, p_quantity numeric, p_budget_cents bigint, p_rationale text)
returns public.enterprise_partner_allocations
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare a public.enterprise_partner_allocations;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1
    from public.enterprise_partner_networks n
    join public.business_members bm on bm.business_id=n.owner_business_id
    join public.businesses b on b.id=n.owner_business_id
    where n.id=p_network_id
      and bm.user_id=auth.uid()
      and bm.role in ('owner','admin')
      and lower(b.business_tier::text) in ('fleet','enterprise')
  ) then raise exception 'Fleet or Enterprise network admin access required'; end if;
  if not exists(select 1 from public.enterprise_partner_network_members where network_id=p_network_id and partner_business_id=p_partner_business_id and status='active') then raise exception 'partner not active'; end if;
  if p_campaign_id is not null and not exists(select 1 from public.enterprise_partner_campaigns where id=p_campaign_id and network_id=p_network_id) then raise exception 'campaign not in network'; end if;
  insert into public.enterprise_partner_allocations(network_id,partner_business_id,campaign_id,allocation_type,quantity,budget_cents,rationale)
  values(p_network_id,p_partner_business_id,p_campaign_id,p_type,greatest(0,p_quantity),greatest(0,p_budget_cents),p_rationale)
  returning * into a;
  return a;
end
$$;

alter function public.get_enterprise_partner_network(uuid,date,date) set search_path=public,auth,extensions,pg_temp;
alter function public.create_partner_allocation(uuid,uuid,uuid,text,numeric,bigint,text) set search_path=public,auth,extensions,pg_temp;
