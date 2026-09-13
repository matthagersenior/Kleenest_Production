
create or replace function public.business_create_custom_qr(
  p_business_id uuid,
  p_location_id uuid,
  p_label text,
  p_purpose text default 'checkin',
  p_action_type text default 'checkin',
  p_action_payload jsonb default '{}'::jsonb,
  p_customization jsonb default '{}'::jsonb,
  p_single_use boolean default false,
  p_max_redemptions integer default null
)
returns public.qr_codes
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_row public.qr_codes;
begin
  if not public.business_capability_allowed(p_business_id,'growth.qr_studio') then
    raise exception 'Business Growth QR Studio capability required';
  end if;

  v_result:=public.qr_studio_upsert_asset(
    p_business_id,
    null,
    p_location_id,
    jsonb_build_object(
      'label',coalesce(nullif(trim(coalesce(p_label,'')),''),'Kleenest QR'),
      'purpose',coalesce(nullif(trim(coalesce(p_purpose,'')),''),'checkin'),
      'action_type',coalesce(nullif(trim(coalesce(p_action_type,'')),''),'checkin'),
      'action_payload',coalesce(p_action_payload,'{}'::jsonb),
      'customization',coalesce(p_customization,'{}'::jsonb),
      'single_use',coalesce(p_single_use,false),
      'max_redemptions',p_max_redemptions
    ),
    'Created from business_create_custom_qr'
  );

  select * into v_row
  from public.qr_codes
  where id=(v_result->>'id')::uuid
    and business_id=p_business_id;

  if v_row.id is null then raise exception 'QR creation failed'; end if;
  return v_row;
end;
$$;

create or replace function public.business_update_custom_qr(
  p_business_id uuid,
  p_qr_id uuid,
  p_label text,
  p_purpose text,
  p_action_type text,
  p_action_payload jsonb,
  p_customization jsonb,
  p_active boolean default true,
  p_single_use boolean default false,
  p_max_redemptions integer default null
)
returns public.qr_codes
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_row public.qr_codes;
begin
  if not public.business_capability_allowed(p_business_id,'growth.qr_studio') then
    raise exception 'Business Growth QR Studio capability required';
  end if;

  v_result:=public.qr_studio_upsert_asset(
    p_business_id,
    p_qr_id,
    null,
    jsonb_build_object(
      'label',coalesce(nullif(trim(coalesce(p_label,'')),''),'Kleenest QR'),
      'purpose',coalesce(nullif(trim(coalesce(p_purpose,'')),''),'checkin'),
      'action_type',coalesce(nullif(trim(coalesce(p_action_type,'')),''),'checkin'),
      'action_payload',coalesce(p_action_payload,'{}'::jsonb),
      'customization',coalesce(p_customization,'{}'::jsonb),
      'active',coalesce(p_active,true),
      'single_use',coalesce(p_single_use,false),
      'max_redemptions',p_max_redemptions
    ),
    'Updated from business_update_custom_qr'
  );

  select * into v_row
  from public.qr_codes
  where id=(v_result->>'id')::uuid
    and business_id=p_business_id;

  if v_row.id is null then raise exception 'QR update failed'; end if;
  return v_row;
end;
$$;

revoke all on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) from public,anon;
revoke all on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) from public,anon;
grant execute on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) to authenticated,service_role;
grant execute on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) to authenticated,service_role;
