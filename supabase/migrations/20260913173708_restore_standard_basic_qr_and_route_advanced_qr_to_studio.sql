
create or replace function public.business_create_qr(
  p_business_id uuid,
  p_location_id uuid,
  p_label text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  if not public.location_belongs_to_business(p_business_id,p_location_id) then
    raise exception 'Location does not belong to business';
  end if;

  v_code:='K'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,20));

  insert into public.qr_codes(
    business_id,location_id,code,active,label,purpose,action_type,
    action_payload,customization,single_use,max_redemptions
  )
  values(
    p_business_id,
    p_location_id,
    v_code,
    true,
    coalesce(nullif(trim(coalesce(p_label,'')),''),'Check-in'),
    'checkin',
    'checkin',
    jsonb_build_object('location_id',p_location_id,'route','check-in'),
    jsonb_build_object(
      'brand_mode','kleenest',
      'foreground','#10182d',
      'background','#ffffff',
      'frame_label','Scan with Kleenest',
      'custom_logo_locked',true
    ),
    false,
    null
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_business_qr(
  p_location_id uuid,
  p_label text default 'Check-in',
  p_purpose text default 'check_in',
  p_action_type text default 'check_in',
  p_single_use boolean default false,
  p_max_redemptions integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_business_id uuid;
  v_qr_id uuid;
  v_row public.qr_codes;
  v_purpose text:=lower(trim(coalesce(p_purpose,'check_in')));
  v_action text:=lower(trim(coalesce(p_action_type,'check_in')));
  v_advanced boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select coalesce(l.claimed_business_id,l.business_id)
    into v_business_id
  from public.locations l
  where l.id=p_location_id and coalesce(l.is_active,true);

  if v_business_id is null then raise exception 'Location not found'; end if;
  if not public.business_can_manage(v_business_id) then
    raise exception 'Business authorization required';
  end if;

  v_advanced :=
    coalesce(p_single_use,false)
    or p_max_redemptions is not null
    or v_purpose not in ('checkin','check_in','check-in')
    or v_action not in ('checkin','check_in','check-in');

  if not v_advanced then
    v_qr_id:=public.business_create_qr(v_business_id,p_location_id,p_label);
    select * into v_row from public.qr_codes where id=v_qr_id;
    return jsonb_build_object(
      'id',v_row.id,
      'code',v_row.code,
      'location_id',v_row.location_id,
      'business_id',v_row.business_id,
      'action_type',v_row.action_type,
      'purpose',v_row.purpose
    );
  end if;

  if not public.business_capability_allowed(v_business_id,'growth.qr_studio') then
    raise exception 'Business Growth QR Studio capability required';
  end if;

  return public.qr_studio_upsert_asset(
    v_business_id,
    null,
    p_location_id,
    jsonb_build_object(
      'label',coalesce(nullif(trim(coalesce(p_label,'')),''),'Kleenest QR'),
      'purpose',v_purpose,
      'action_type',case
        when v_action in ('check_in','check-in') then 'checkin'
        else v_action
      end,
      'action_payload',jsonb_build_object('location_id',p_location_id),
      'single_use',coalesce(p_single_use,false),
      'max_redemptions',p_max_redemptions,
      'customization','{}'::jsonb
    ),
    'Created from legacy Business QR API'
  );
end;
$$;

revoke all on function public.business_create_qr(uuid,uuid,text) from public,anon;
revoke all on function public.create_business_qr(uuid,text,text,text,boolean,integer) from public,anon;
grant execute on function public.business_create_qr(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.create_business_qr(uuid,text,text,text,boolean,integer) to authenticated,service_role;
