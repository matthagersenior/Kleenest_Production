begin;
create or replace function public.enable_enterprise_fleet_service(p_user_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth,extensions,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and is_platform_owner=true) then raise exception 'platform owner authorization required'; end if;
 insert into public.account_service_entitlements(account_user_id,service_tier,enterprise_fleet_enabled,fleet_enabled)
 values(p_user_id,'enterprise',true,true)
 on conflict(account_user_id,service_tier) do update set enterprise_fleet_enabled=true,fleet_enabled=true,updated_at=now()
 returning id into v_id;
 return v_id;
end; $$;
commit;
