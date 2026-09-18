create or replace function public.account_effective_business_tier(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case coalesce(max(case b.business_tier::text when 'enterprise' then 4 when 'growth' then 3 when 'fleet' then 2 when 'standard' then 1 else 0 end),0)
    when 4 then 'enterprise'
    when 3 then 'growth'
    when 2 then 'fleet'
    when 1 then 'standard'
    else 'free'
  end
  from public.business_members m
  join public.businesses b on b.id=m.business_id
  where m.user_id=(select auth.uid())
    and p_user_id=(select auth.uid())
    and m.role::text in ('owner','admin');
$$;
revoke execute on function public.account_effective_business_tier(uuid) from anon;
grant execute on function public.account_effective_business_tier(uuid) to authenticated;
