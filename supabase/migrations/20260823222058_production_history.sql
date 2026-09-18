create or replace function public.account_effective_business_tier(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    max(case b.business_tier::text
      when 'enterprise' then 4
      when 'growth' then 3
      when 'fleet' then 2
      when 'standard' then 1
      else 0 end)::text,
    '0'
  )
  from public.business_members m
  join public.businesses b on b.id=m.business_id
  where m.user_id=p_user_id
    and m.role::text in ('owner','admin');
$$;
