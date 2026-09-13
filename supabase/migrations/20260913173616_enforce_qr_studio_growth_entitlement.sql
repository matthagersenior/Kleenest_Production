
do $$
declare
  v_def text;
  v_old text := '  if not public.business_can_manage(p_business_id) then raise exception ''Business management access required''; end if;';
  v_new text := $gate$
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;

  if not public.business_capability_allowed(p_business_id,'growth.qr_studio') then
    if p_qr_id is null then
      raise exception 'Business Growth QR Studio capability required';
    end if;

    if jsonb_object_length(v_patch)=1 and v_patch ? 'active' then
      if coalesce((v_patch->>'active')::boolean,false)=false then
        null;
      elsif not exists(
        select 1 from public.qr_code_versions v
        where v.qr_code_id=p_qr_id and v.business_id=p_business_id
      ) then
        null;
      else
        raise exception 'Business Growth QR Studio capability required';
      end if;
    else
      raise exception 'Business Growth QR Studio capability required';
    end if;
  end if;
$gate$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='qr_studio_upsert_asset'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_qr_id uuid, p_location_id uuid, p_patch jsonb, p_change_summary text';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'qr_studio_upsert_asset authorization anchor not found';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end $$;

do $$
declare
  v_def text;
  v_old text := '  if not public.business_can_manage(p_business_id) then raise exception ''Business management access required''; end if;';
  v_new text := $gate$
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_capability_allowed(p_business_id,'growth.qr_studio') then
    raise exception 'Business Growth QR Studio capability required';
  end if;
$gate$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='business_create_custom_qr'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_location_id uuid, p_label text, p_purpose text, p_action_type text, p_action_payload jsonb, p_customization jsonb, p_single_use boolean, p_max_redemptions integer';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'business_create_custom_qr authorization anchor not found';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end $$;

do $$
declare
  v_def text;
  v_old text := '  if not public.business_can_manage(p_business_id) then raise exception ''Business management access required''; end if;';
  v_new text := $gate$
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_capability_allowed(p_business_id,'growth.qr_studio') then
    raise exception 'Business Growth QR Studio capability required';
  end if;
$gate$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='business_update_custom_qr'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_qr_id uuid, p_label text, p_purpose text, p_action_type text, p_action_payload jsonb, p_customization jsonb, p_active boolean, p_single_use boolean, p_max_redemptions integer';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'business_update_custom_qr authorization anchor not found';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end $$;

create or replace function public.business_delete_qr(
  p_business_id uuid,
  p_qr_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;

  delete from public.qr_codes q
  where q.id=p_qr_id and q.business_id=p_business_id;

  return found;
end;
$$;

revoke all on function public.qr_studio_upsert_asset(uuid,uuid,uuid,jsonb,text) from public,anon;
revoke all on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) from public,anon;
revoke all on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) from public,anon;
revoke all on function public.business_delete_qr(uuid,uuid) from public,anon;

grant execute on function public.qr_studio_upsert_asset(uuid,uuid,uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) to authenticated,service_role;
grant execute on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) to authenticated,service_role;
grant execute on function public.business_delete_qr(uuid,uuid) to authenticated,service_role;
