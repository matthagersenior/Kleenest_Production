create or replace function public.business_manage_qr(p_business_id uuid, p_location_id uuid, p_qr_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.qr_codes; role text;
begin
  select lower(bm.role) into role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() limit 1;
  if role not in ('owner','admin') and coalesce((select is_admin from public.profiles where id=auth.uid()),false) is not true then raise exception 'Admin access required'; end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_action='create' then
    insert into public.qr_codes(location_id,code,active,label,customization) values(p_location_id,encode(gen_random_bytes(12),'hex'),true,coalesce(p_payload->>'label','Location QR'),coalesce(p_payload->'customization','{}'::jsonb)) returning * into q;
  elsif p_action='update' then
    update public.qr_codes set label=coalesce(p_payload->>'label',label),customization=coalesce(p_payload->'customization',customization),active=coalesce((p_payload->>'active')::boolean,active) where id=p_qr_id and (p_location_id is null or location_id=p_location_id) and exists(select 1 from public.locations l where l.id=qr_codes.location_id and l.business_id=p_business_id) returning * into q;
  elsif p_action='deactivate' then
    update public.qr_codes set active=false where id=p_qr_id and (p_location_id is null or location_id=p_location_id) and exists(select 1 from public.locations l where l.id=qr_codes.location_id and l.business_id=p_business_id) returning * into q;
  else raise exception 'Unsupported QR action'; end if;
  if q.id is null then raise exception 'QR code not found'; end if;
  return to_jsonb(q);
end;
$$;
