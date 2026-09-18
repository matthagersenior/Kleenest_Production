insert into public.capability_function_classifications(function_signature,domain,classification,rationale) values
('prepare_universal_location_discovery(double precision,double precision,integer,uuid,text,text,integer)','location_discovery','canonical','Canonical universal discovery boundary used by map/results.'),
('map_network_nearby_v1(double precision,double precision,integer,integer,text,text,text[])','location_discovery','supporting','Map-specific network query retained as supporting/compatibility path while consumers converge on universal discovery.'),
('nearby_locations(double precision,double precision,integer,integer)','location_discovery','compatibility','Legacy generic nearby query.'),
('nearby_locations_enriched(double precision,double precision,integer,integer,uuid[])','location_discovery','compatibility','Legacy enriched nearby query.'),
('nearby_restrooms(double precision,double precision,integer,integer)','location_discovery','compatibility','Legacy restroom-specific nearby query.'),
('record_location_discovery_event(double precision,double precision,numeric,text[],integer)','location_discovery','supporting','Telemetry/audit event for discovery.'),
('resolve_location_external_identity(text,text,double precision,double precision,text)','location_identity','canonical','Canonical external identity resolution.'),
('resolve_location_identity(text,text,double precision,double precision)','location_identity','compatibility','Legacy identity resolver retained for callers not yet migrated.'),
('resolve_location_identity(text,text,numeric,numeric)','location_identity','compatibility','Overloaded legacy identity resolver retained for callers not yet migrated.'),
('can_activate_preferred_location_identity(text,text,double precision,double precision)','location_identity','supporting','Eligibility check for preferred identity activation.'),
('demo_complete_identity(text)','location_identity','compatibility','Demo identity workflow; not a production canonical capability.'),
('demo_link_identity(text,uuid)','location_identity','compatibility','Demo identity workflow; not a production canonical capability.'),
('demo_register_identity(text,text,text,text)','location_identity','compatibility','Demo identity workflow; not a production canonical capability.')
on conflict(function_signature) do update set domain=excluded.domain, classification=excluded.classification, rationale=excluded.rationale, updated_at=now();

create or replace function public.capability_classification_summary() returns table(domain text, classification text, function_count bigint) language sql security definer set search_path=public as $$
 select domain, classification, count(*) from public.capability_function_classifications group by domain, classification order by domain, classification;
$$;
revoke all on function public.capability_classification_summary() from public;
grant execute on function public.capability_classification_summary() to authenticated;
