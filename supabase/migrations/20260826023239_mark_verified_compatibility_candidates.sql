insert into public.capability_function_classifications(function_signature,domain,classification,rationale) values
('business_update_member_role(uuid,uuid,business_member_role)','business_membership','compatibility','Legacy role mutation; canonical role mutation is business_change_member_role.'),
('fleet_dashboard_summary(uuid)','fleet_analytics','compatibility','Legacy compact dashboard; fleet_dashboard_summary_v2 is canonical.'),
('nearby_locations(double precision,double precision,integer,integer)','location_discovery','compatibility','Legacy nearby-location RPC superseded by universal discovery.'),
('nearby_locations_enriched(double precision,double precision,integer,integer,uuid[])','location_discovery','compatibility','Legacy enriched nearby RPC superseded by universal discovery.'),
('nearby_restrooms(double precision,double precision,integer,integer)','location_discovery','compatibility','Legacy restroom-only RPC superseded by universal discovery.'),
('record_gps_checkin(double precision,double precision,integer)','consumer_checkins','compatibility','Legacy GPS-only check-in path; canonical check-in flows are create_check_in and kleenest_map_check_in.'),
('resolve_location_identity(text,text,double precision,double precision)','location_identity','compatibility','Legacy identity resolver superseded by external-identity resolution.'),
('resolve_location_identity(text,text,numeric,numeric)','location_identity','compatibility','Legacy numeric identity resolver superseded by external-identity resolution.'),
('admin_assign_business_member(uuid,uuid,business_member_role)','owner_admin_crud','supporting','Owner/Admin CRUD primitive for business membership; governed by admin_crud_gateway rather than a competing capability.'),
('business_dashboard_summary(uuid,timestamp with time zone,timestamp with time zone)','business_analytics','compatibility','Legacy event-count dashboard summary superseded by secure dashboard summary.'),
('get_business_dashboard()','business_analytics','compatibility','Legacy broad business dashboard; secure dashboard summary is canonical analytics boundary.')
on conflict(function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale,updated_at=now();
