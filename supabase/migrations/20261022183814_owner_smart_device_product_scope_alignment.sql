-- Keep KleenestOS owner product controls aligned with the already-deployed
-- Smart Facilities bundle and the platform-api device authorization routes.
-- Preserve existing owner-session authorization, audit logging and all other validation.
CREATE OR REPLACE FUNCTION public.owner_update_platform_partner(p_partner_id uuid, p_patch jsonb, p_reason text DEFAULT 'KleenestOS partner update'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
  v_before jsonb;
  v_after jsonb;
  v_products text[];
  v_surfaces text[];
  v_scopes text[];
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if not exists(select 1 from public.platform_partners p where p.id=p_partner_id) then raise exception 'Partner not found'; end if;
  if exists(select 1 from jsonb_object_keys(v_patch) k where k not in (
    'name','status','plan','quota_per_minute','quota_per_month','api_products','integration_surfaces','scopes','pilot_session_id','owner_notes'
  )) then raise exception 'unsupported partner control field'; end if;
  if v_patch?'status' and v_patch->>'status' not in ('active','suspended','closed') then raise exception 'invalid partner status'; end if;
  if v_patch?'plan' and v_patch->>'plan' not in ('developer','growth','fleet','enterprise') then raise exception 'invalid partner plan'; end if;

  select public.platform_partner_summary(p_partner_id) into v_before;

  if v_patch?'api_products' then
    select coalesce(array_agg(value),'{}'::text[]) into v_products from jsonb_array_elements_text(v_patch->'api_products') value;
    if exists(select 1 from unnest(v_products) x where x not in ('nearby','route','place_details','place_match','smart_devices')) then raise exception 'invalid API product'; end if;
  end if;
  if v_patch?'integration_surfaces' then
    select coalesce(array_agg(value),'{}'::text[]) into v_surfaces from jsonb_array_elements_text(v_patch->'integration_surfaces') value;
    if exists(select 1 from unnest(v_surfaces) x where x not in ('rest','sdk','widget','map','route_sdk','webhooks','mcp')) then raise exception 'invalid integration surface'; end if;
  end if;
  if v_patch?'scopes' then
    select coalesce(array_agg(value),'{}'::text[]) into v_scopes from jsonb_array_elements_text(v_patch->'scopes') value;
    if exists(select 1 from unnest(v_scopes) x where x not in ('recommendations:read','platform:read','devices:read','devices:write','devices:command','devices:events:write','*')) then raise exception 'invalid platform scope'; end if;
  end if;
  if v_patch?'pilot_session_id' and nullif(v_patch->>'pilot_session_id','') is not null
     and not exists(select 1 from public.capability_pilot_sessions s where s.id=(v_patch->>'pilot_session_id')::uuid) then
    raise exception 'Pilot session not found';
  end if;

  update public.platform_partners p set
    name=case when v_patch?'name' then trim(v_patch->>'name') else p.name end,
    status=case when v_patch?'status' then v_patch->>'status' else p.status end,
    plan=case when v_patch?'plan' then v_patch->>'plan' else p.plan end,
    quota_per_minute=case when v_patch?'quota_per_minute' then (v_patch->>'quota_per_minute')::integer else p.quota_per_minute end,
    quota_per_month=case when v_patch?'quota_per_month' then (v_patch->>'quota_per_month')::bigint else p.quota_per_month end,
    updated_at=now()
  where p.id=p_partner_id;

  insert into public.platform_partner_product_access(partner_id,updated_by)
  values(p_partner_id,auth.uid())
  on conflict(partner_id) do nothing;

  update public.platform_partner_product_access a set
    bundle_key=case when v_patch ?| array['api_products','integration_surfaces','scopes'] then null else a.bundle_key end,
    api_products=case when v_patch?'api_products' then v_products else a.api_products end,
    integration_surfaces=case when v_patch?'integration_surfaces' then v_surfaces else a.integration_surfaces end,
    scopes=case when v_patch?'scopes' then v_scopes else a.scopes end,
    pilot_session_id=case when v_patch?'pilot_session_id' then nullif(v_patch->>'pilot_session_id','')::uuid else a.pilot_session_id end,
    owner_notes=case when v_patch?'owner_notes' then nullif(trim(v_patch->>'owner_notes'),'') else a.owner_notes end,
    updated_by=auth.uid(),updated_at=now()
  where a.partner_id=p_partner_id;

  select public.platform_partner_summary(p_partner_id) into v_after;
  insert into public.platform_partner_control_log(partner_id,action,changed_by,reason,previous_state,next_state)
  values(p_partner_id,'update_partner',auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return v_after;
end;
$function$;
