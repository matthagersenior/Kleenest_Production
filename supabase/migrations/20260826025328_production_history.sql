insert into public.capability_retirement_log(function_signature,canonical_replacement,github_callers,postgres_dependents,evidence) values
('business_dashboard_summary(uuid,timestamp with time zone,timestamp with time zone)','business_dashboard_secure_summary',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('get_business_dashboard()','business_dashboard_secure_summary',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('business_create_event(uuid,text,text,date,time without time zone,uuid)','business_manage_event',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('business_create_event(uuid,text,text,uuid,date,time without time zone)','business_manage_event',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('business_create_event(uuid,text)','business_manage_event',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('business_set_event(uuid,uuid,text,text,date,time without time zone,uuid)','business_manage_event',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('create_business_event(uuid,text,text,date,time without time zone,uuid)','business_manage_event',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('business_update_member_role(uuid,uuid,business_member_role)','business_change_member_role',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('set_business_location_status(uuid,uuid,boolean)','business_set_location_active',0,0,'Exact signature has zero PostgreSQL dependents and no GitHub application caller.'),
('record_gps_checkin(double precision,double precision,integer)','create_check_in / kleenest_map_check_in',0,0,'Exact signature has zero PostgreSQL dependents; GitHub references are audit documentation only, not an application caller.'),
('fleet_dashboard_summary(uuid)','fleet_dashboard_summary_v2',0,0,'Exact signature has zero PostgreSQL dependents; application service calls fleet_dashboard_summary_v2.')
on conflict(function_signature) do update set canonical_replacement=excluded.canonical_replacement,github_callers=excluded.github_callers,postgres_dependents=excluded.postgres_dependents,evidence=excluded.evidence,retired_at=now();

drop function if exists public.business_dashboard_summary(uuid,timestamptz,timestamptz);
drop function if exists public.get_business_dashboard();
drop function if exists public.business_create_event(uuid,text,text,date,time,uuid);
drop function if exists public.business_create_event(uuid,text,text,uuid,date,time);
drop function if exists public.business_create_event(uuid,text);
drop function if exists public.business_set_event(uuid,uuid,text,text,date,time,uuid);
drop function if exists public.create_business_event(uuid,text,text,date,time,uuid);
drop function if exists public.business_update_member_role(uuid,uuid,business_member_role);
drop function if exists public.set_business_location_status(uuid,uuid,boolean);
drop function if exists public.record_gps_checkin(double precision,double precision,integer);
drop function if exists public.fleet_dashboard_summary(uuid);
