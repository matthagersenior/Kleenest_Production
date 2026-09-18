create or replace function public.enterprise_list_network_members(p_network_id uuid)
returns table(id uuid,network_id uuid,partner_business_id uuid,partner_business_name text,status text,created_at timestamptz)
language sql stable security definer set search_path=public,auth,extensions,pg_temp as $$
  select m.id,m.network_id,m.partner_business_id,b.name,m.status,m.created_at
  from public.enterprise_partner_network_members m
  join public.enterprise_partner_networks n on n.id=m.network_id
  join public.businesses b on b.id=m.partner_business_id
  where m.network_id=p_network_id
    and exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'));
$$;

create or replace function public.enterprise_list_partner_businesses(p_business_id uuid)
returns table(id uuid,name text,business_tier text)
language sql stable security definer set search_path=public,auth,extensions,pg_temp as $$
  select b.id,b.name,b.business_tier::text
  from public.businesses b
  where b.id<>p_business_id
    and exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))
  order by b.name;
$$;

grant execute on function public.enterprise_list_network_members(uuid) to authenticated;
grant execute on function public.enterprise_list_partner_businesses(uuid) to authenticated;
