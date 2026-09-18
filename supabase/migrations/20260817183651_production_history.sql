drop function if exists public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb);
drop function if exists public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean);
create function public.business_create_custom_qr(
  p_business_id uuid,
  p_location_id uuid,
  p_label text,
  p_purpose text default 'checkin',
  p_action_type text default 'checkin',
  p_action_payload jsonb default '{}'::jsonb,
  p_customization jsonb default '{}'::jsonb,
  p_single_use boolean default false,
  p_max_redemptions integer default null
) returns public.qr_codes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v public.qr_codes;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  if p_location_id is not null and not exists(select 1 from public.locations l where l.id=p_location_id and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then raise exception 'Maximum redemptions must be at least 1'; end if;
  insert into public.qr_codes(business_id,location_id,code,label,active,customization,purpose,action_type,action_payload,single_use,max_redemptions)
  values(p_business_id,p_location_id,encode(gen_random_bytes(12),'hex'),nullif(trim(p_label),''),true,coalesce(p_customization,'{}'::jsonb),coalesce(nullif(trim(p_purpose),''),'custom'),coalesce(nullif(trim(p_action_type),''),'custom'),coalesce(p_action_payload,'{}'::jsonb),coalesce(p_single_use,false),case when coalesce(p_single_use,false) then p_max_redemptions else null end)
  returning * into v;
  return v;
end; $$;
create function public.business_update_custom_qr(
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
) returns public.qr_codes
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v public.qr_codes;
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then raise exception 'Maximum redemptions must be at least 1'; end if;
  update public.qr_codes q set
    label=nullif(trim(p_label),''),
    purpose=coalesce(nullif(trim(p_purpose),''),'custom'),
    action_type=coalesce(nullif(trim(p_action_type),''),'custom'),
    action_payload=coalesce(p_action_payload,'{}'::jsonb),
    customization=coalesce(p_customization,'{}'::jsonb),
    active=p_active,
    single_use=coalesce(p_single_use,false),
    max_redemptions=case when coalesce(p_single_use,false) then p_max_redemptions else null end
  where q.id=p_qr_id and q.business_id=p_business_id returning q.* into v;
  if v.id is null then raise exception 'QR code not found'; end if;
  return v;
end; $$;
revoke execute on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) from public, anon;
revoke execute on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) from public, anon;
grant execute on function public.business_create_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,integer) to authenticated;
grant execute on function public.business_update_custom_qr(uuid,uuid,text,text,text,jsonb,jsonb,boolean,boolean,integer) to authenticated;
