
create or replace function public.get_business_location_cap(p_business_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tier text;
  v_service_tier text;
begin
  if session_user <> 'postgres'
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and not coalesce(public.is_platform_owner(auth.uid()),false)
     and not exists(
       select 1 from public.business_members bm
       where bm.business_id=p_business_id
         and bm.user_id=auth.uid()
     ) then
    raise exception 'Business membership required' using errcode='42501';
  end if;

  select b.business_tier::text
    into v_tier
  from public.businesses b
  where b.id=p_business_id;

  if v_tier is null then
    return null;
  end if;

  select a.service_tier
    into v_service_tier
  from public.business_members bm
  join public.account_service_entitlements a on a.account_user_id=bm.user_id
  where bm.business_id=p_business_id
    and bm.role::text in ('owner','admin')
  order by case a.service_tier when 'enterprise' then 0 when 'growth' then 1 else 2 end,
           a.updated_at desc
  limit 1;

  return case
    when v_tier='enterprise' or coalesce(v_service_tier,'')='enterprise' then null
    when v_tier in ('growth','fleet') or coalesce(v_service_tier,'')='growth' then 5
    else 1
  end;
end;
$$;

revoke all on function public.get_business_location_cap(uuid) from public, anon;
grant execute on function public.get_business_location_cap(uuid) to authenticated, service_role;
