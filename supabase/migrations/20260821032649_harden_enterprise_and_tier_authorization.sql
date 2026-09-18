create or replace function public.create_enterprise_partner_network(p_name text)
returns public.enterprise_partner_networks
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare b uuid; n public.enterprise_partner_networks;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select business_id into b from public.business_members where user_id=auth.uid() and role in ('owner','admin') order by business_id limit 1;
  if b is null then raise exception 'business admin membership required'; end if;
  if not exists(select 1 from public.businesses where id=b and lower(business_tier::text) in ('fleet','enterprise')) then raise exception 'Fleet or Enterprise plan required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'network name required'; end if;
  insert into public.enterprise_partner_networks(owner_business_id,name) values(b,trim(p_name)) returning * into n;
  return n;
end; $$;

create or replace function public.activate_partner_allocation(p_allocation_id uuid)
returns public.enterprise_partner_allocations
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare a public.enterprise_partner_allocations;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.enterprise_partner_allocations x
     set status='active', activated_at=now()
   where x.id=p_allocation_id
     and x.status='planned'
     and x.network_id in (
       select n.id from public.enterprise_partner_networks n
       where n.owner_business_id in (
         select bm.business_id from public.business_members bm
         where bm.user_id=auth.uid() and bm.role in ('owner','admin')
       )
     )
   returning x.* into a;
  if not found then raise exception 'allocation unavailable or insufficient permissions'; end if;
  return a;
end; $$;

create or replace function public.family_has_premium_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select p_user_id is not null and p_user_id=auth.uid() and exists(
    select 1 from public.family_members fm
    join public.family_accounts fa on fa.id=fm.group_id
    where fm.user_id=p_user_id and fa.plan_code='family'
      and (select count(*) from public.family_members x where x.group_id=fm.group_id)<=5
  );
$$;

create or replace function public.get_effective_consumer_tier(p_user_id uuid)
returns text language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case when p_user_id is not null and p_user_id=auth.uid() and public.family_has_premium_access(p_user_id) then 'premium'
              when p_user_id is not null and p_user_id=auth.uid() then coalesce((select subscription_tier::text from public.profiles where id=p_user_id),'free')
              else 'free' end;
$$;
