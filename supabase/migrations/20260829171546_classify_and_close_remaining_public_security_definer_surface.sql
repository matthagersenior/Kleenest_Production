revoke execute on function public.admin_backend_resource_catalog() from anon;
revoke execute on function public.converge_fleet_operational_event_to_intelligence() from anon, authenticated;
revoke execute on function public.sync_external_location_address() from anon, authenticated;

insert into public.capability_function_classifications(function_signature, domain, classification, rationale, updated_at)
values
 ('admin_backend_resource_catalog()', 'owner_admin', 'canonical', 'Owner/admin backend resource catalog; requires platform-owner authorization and must not be anonymously executable.', now()),
 ('converge_fleet_operational_event_to_intelligence()', 'fleet_operations', 'trigger_helper', 'Database trigger helper that converges fleet operational events into the canonical intelligence/event stream; not a client RPC.', now()),
 ('get_public_qr_landing(p_qr_code text)', 'qr_access', 'canonical', 'Public QR landing endpoint intentionally supports anonymous scans and attribution.', now()),
 ('map_network_nearby_v1(p_lat double precision, p_lng double precision, p_radius_m integer, p_limit integer, p_category text, p_search text, p_amenity_names text[])', 'location_discovery', 'canonical', 'Canonical public map/discovery read endpoint; intentionally callable anonymously for map browsing.', now()),
 ('sync_external_location_address()', 'location_identity', 'trigger_helper', 'Database trigger helper that synchronizes canonical location address data from external records; not a client RPC.', now())
on conflict(function_signature) do update set domain=excluded.domain, classification=excluded.classification, rationale=excluded.rationale, updated_at=excluded.updated_at;
