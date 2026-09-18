create or replace function public.business_live_network_manifest(p_business_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or not public.business_can_manage(p_business_id) then raise exception 'business manager access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'geofence_id',g.id,'business_id',g.business_id,'location_id',g.location_id,
      'radius_meters',g.radius_meters,'notification_enabled',g.notification_enabled,
      'notification_payload',g.notification_payload,'active',g.active,
      'location_name',l.name,'latitude',l.latitude,'longitude',l.longitude,
      'address',l.address,'city',l.city,'state',l.state
    ) order by l.name nulls last,g.created_at)
    from public.business_geofences g
    left join public.locations l on l.id=g.location_id
    where g.business_id=p_business_id and g.active
      and l.latitude is not null and l.longitude is not null
  ),'[]'::jsonb);
end $$;
revoke all on function public.business_live_network_manifest(uuid) from public,anon;
grant execute on function public.business_live_network_manifest(uuid) to authenticated,service_role;
