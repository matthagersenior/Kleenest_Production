-- Check-ins are created through verify_checkin(), not direct client inserts.
drop policy if exists checkins_own_insert on public.check_ins;
-- Keep direct inserts blocked; the verified RPC below performs the insert with controlled inputs.

-- Verify-check-in is the intended authenticated API. It validates auth, QR status, location status,
-- geofence distance, and recent duplicate scans before inserting a check-in.
create or replace function public.verify_checkin(p_qr_code text, p_lat double precision default null, p_lng double precision default null)
returns public.check_ins
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_qr public.qr_codes%rowtype;
  v_loc public.locations%rowtype;
  v_check public.check_ins%rowtype;
  v_distance double precision;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_qr from public.qr_codes where code = p_qr_code and active = true limit 1;
  if not found then raise exception 'Invalid or inactive QR code'; end if;
  select * into v_loc from public.locations where id = v_qr.location_id and is_active = true and verification_status = 'verified';
  if not found then raise exception 'Location is not currently available for check-in'; end if;
  if p_lat is not null and p_lng is not null and v_loc.geom is not null then
    v_distance := extensions.st_distance(v_loc.geom, extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography);
    if v_distance > coalesce(v_loc.geofence_radius_m,250) then raise exception 'You are too far from this location'; end if;
  end if;
  if exists(select 1 from public.check_ins where user_id=v_uid and location_id=v_loc.id and checked_in_at > now()-interval '30 minutes') then
    raise exception 'Already checked in here recently';
  end if;
  insert into public.check_ins(user_id,location_id,qr_code_id,latitude,longitude,distance_meters,verification_method)
  values(v_uid,v_loc.id,v_qr.id,p_lat,p_lng,v_distance,'qr') returning * into v_check;
  return v_check;
end;
$$;
revoke execute on function public.verify_checkin(text,double precision,double precision) from public, anon;
grant execute on function public.verify_checkin(text,double precision,double precision) to authenticated;

-- Dashboard summaries must not be a public data-extraction endpoint.
revoke execute on function public.business_dashboard_summary(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.business_dashboard_summary(uuid,timestamptz,timestamptz) to authenticated;

-- Internal/trigger helpers are not client APIs.
revoke execute on function public.create_default_location_data(uuid) from public, anon, authenticated;
revoke execute on function public.set_location_geom() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Indexes for the production paths we just secured.
create index if not exists check_ins_qr_idx on public.check_ins (qr_code_id, checked_in_at desc);
create index if not exists qr_codes_location_active_idx on public.qr_codes (location_id, active);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, updated_at desc);
create index if not exists subscriptions_business_idx on public.subscriptions (business_id, updated_at desc);
create index if not exists partner_agreements_business_idx on public.partner_agreements (partner_business_id);
create index if not exists partner_programs_business_idx on public.partner_programs (business_id, enabled);
