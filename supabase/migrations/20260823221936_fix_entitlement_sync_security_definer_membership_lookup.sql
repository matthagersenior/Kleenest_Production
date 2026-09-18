create or replace function public.sync_business_service_entitlement(p_business_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid; v_tier public.business_tier; v_id uuid;
begin
 select business_tier into v_tier from public.businesses where id=p_business_id;
 if not found then raise exception 'business not found'; end if;
 select bm.user_id into v_owner from public.business_members bm where bm.business_id=p_business_id and bm.role::text in ('owner','admin') order by case when bm.role::text='owner' then 0 else 1 end,bm.created_at limit 1;
 if v_owner is null then return null; end if;
 insert into public.account_service_entitlements(account_user_id,service_tier,location_limit,enterprise_fleet_enabled,fleet_enabled)
 values(v_owner,case when v_tier in ('enterprise','growth') then 'enterprise' else 'business' end,case when v_tier='growth' then 5 else null end,v_tier='enterprise',v_tier='fleet')
 on conflict(account_user_id,service_tier) do update set location_limit=case when v_tier='growth' then 5 else account_service_entitlements.location_limit end,enterprise_fleet_enabled=case when v_tier='enterprise' then true else account_service_entitlements.enterprise_fleet_enabled end,fleet_enabled=case when v_tier='fleet' then true else account_service_entitlements.fleet_enabled end,updated_at=now()
 returning id into v_id;
 return v_id;
end; $$;
