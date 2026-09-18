create table if not exists public.capability_retirement_log (id uuid primary key default gen_random_uuid(),function_signature text not null unique,canonical_replacement text,github_callers integer not null,postgres_dependents integer not null,evidence text not null,retired_at timestamptz not null default now());
insert into public.capability_retirement_log(function_signature,canonical_replacement,github_callers,postgres_dependents,evidence) values
('enroll_program_location(uuid,uuid)','business_add_program_location(uuid,uuid)',0,0,'Exact signature verified; no database dependents; no application callers found.'),
('remove_program_location(uuid,uuid)','business_remove_program_location(uuid,uuid)',0,0,'Exact signature verified; no database dependents; no application callers found.'),
('resolve_location_identity(text,text,double precision,double precision)','canonical external-identity resolution',0,0,'Exact legacy signature verified; no database dependents; no application callers found.'),
('resolve_location_identity(text,text,numeric,numeric)','canonical external-identity resolution',0,0,'Exact legacy numeric signature verified; no database dependents; no application callers found.'),
('activate_preferred_location(uuid,uuid)','canonical preferred-location activation',0,0,'Exact signature verified; no database dependents; no application callers found.'),
('check_preferred_eligibility(uuid)','canonical preferred-location eligibility',0,0,'Exact signature verified; no database dependents; no application callers found.'),
('record_preferred_usage(uuid,text,jsonb)','canonical preferred-location usage telemetry',0,0,'Exact signature verified; no database dependents; no application callers found.')
on conflict(function_signature) do update set canonical_replacement=excluded.canonical_replacement,github_callers=excluded.github_callers,postgres_dependents=excluded.postgres_dependents,evidence=excluded.evidence,retired_at=now();
drop function if exists public.enroll_program_location(uuid,uuid);
drop function if exists public.remove_program_location(uuid,uuid);
drop function if exists public.resolve_location_identity(text,text,double precision,double precision);
drop function if exists public.resolve_location_identity(text,text,numeric,numeric);
drop function if exists public.activate_preferred_location(uuid,uuid);
drop function if exists public.check_preferred_eligibility(uuid);
drop function if exists public.record_preferred_usage(uuid,text,jsonb);
