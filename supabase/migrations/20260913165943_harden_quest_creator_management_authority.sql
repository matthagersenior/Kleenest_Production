
create or replace function public.quest_creator_authorized(p_owner_type text,p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_type text:=lower(trim(coalesce(p_owner_type,'')));
  v_admin jsonb;
begin
  if auth.uid() is null or p_owner_id is null then return false; end if;

  if v_type='admin' then
    v_admin:=public.admin_authorization_v1();
    return coalesce((v_admin->>'authorized')::boolean,false)
        or coalesce((v_admin->>'is_admin')::boolean,false)
        or coalesce((v_admin->>'is_owner')::boolean,false);
  end if;

  if v_type='business' then
    return public.business_can_manage(p_owner_id);
  end if;

  if v_type='fleet' then
    return public.business_fleet_authorized(p_owner_id)
       and (
         public.fleet_actor_is_manager(p_owner_id)
         or public.is_platform_owner_session()
       );
  end if;

  if v_type='enterprise' then
    return public.business_enterprise_authorized(p_owner_id)
       and public.business_can_manage(p_owner_id);
  end if;

  return false;
end;
$$;

revoke all on function public.quest_creator_authorized(text,uuid) from public,anon,authenticated;
grant execute on function public.quest_creator_authorized(text,uuid) to service_role;
