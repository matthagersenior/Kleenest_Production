create unique index if not exists business_geofences_business_location_key on public.business_geofences(business_id,location_id) where location_id is not null;

create or replace function public.business_ensure_live_network_geofences(p_business_id uuid,p_radius_meters integer default 150)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare v_count integer:=0;
begin
  if auth.uid() is null or not public.business_can_manage(p_business_id) then raise exception 'business manager access required'; end if;
  if p_radius_meters<50 or p_radius_meters>1000 then raise exception 'radius must be between 50 and 1000 meters'; end if;
  insert into public.business_geofences(business_id,location_id,radius_meters,notification_enabled,notification_payload,active)
  select p_business_id,l.id,p_radius_meters,true,jsonb_build_object('title','Kleenest Live Network','body','Live location activity is available for this business location.'),true
  from public.locations l
  where l.business_id=p_business_id and coalesce(l.is_active,true) and l.latitude is not null and l.longitude is not null
  on conflict (business_id,location_id) where location_id is not null do update
    set active=true;
  get diagnostics v_count=row_count;
  return jsonb_build_object('touched',v_count,'manifest',public.business_live_network_manifest(p_business_id));
end $$;
revoke all on function public.business_ensure_live_network_geofences(uuid,integer) from public,anon;
grant execute on function public.business_ensure_live_network_geofences(uuid,integer) to authenticated,service_role;
