create table if not exists public.capability_retirement_log (id uuid primary key default gen_random_uuid(), function_signature text not null unique, canonical_replacement text, github_callers integer not null, postgres_dependents integer not null, evidence text not null, retired_at timestamptz not null default now());

insert into public.capability_retirement_log(function_signature,canonical_replacement,github_callers,postgres_dependents,evidence)
values
('business_accept_partner_agreement(uuid)','accept_partner_agreement(uuid)',0,0,'Schema-verified zero PostgreSQL dependents; application caller audit found no production caller.'),
('business_create_partner_program(text,uuid)','create_business_partner_program(uuid,text,boolean,numeric,text)',0,0,'Schema-verified zero PostgreSQL dependents; compatibility signature superseded by canonical partner-program capability.'),
('business_set_qr_active(uuid,boolean)','set_business_qr_status(uuid,uuid,boolean)',0,0,'Schema-verified zero PostgreSQL dependents; application caller audit found no production caller.'),
('set_business_partner_program_status(uuid,uuid,boolean)','set_business_partner_program_status(uuid,uuid,boolean) canonical boundary',0,0,'Schema-verified zero PostgreSQL dependents; no production caller found; retained as compatibility record pending canonical naming review.'),
('set_qr_active(uuid,boolean)','set_business_qr_status(uuid,uuid,boolean)',0,0,'Schema-verified zero PostgreSQL dependents; application caller audit found no production caller.'),
('nearby_locations(double precision,double precision,integer,integer)','universal discovery RPC',0,0,'Schema-verified zero PostgreSQL dependents; superseded by canonical universal discovery.'),
('nearby_locations_enriched(double precision,double precision,integer,integer,uuid[])','universal discovery RPC',0,0,'Schema-verified zero PostgreSQL dependents; superseded by canonical universal discovery.'),
('nearby_restrooms(double precision,double precision,integer,integer)','universal discovery RPC',0,0,'Schema-verified zero PostgreSQL dependents; superseded by canonical universal discovery.')
on conflict(function_signature) do update set canonical_replacement=excluded.canonical_replacement,github_callers=excluded.github_callers,postgres_dependents=excluded.postgres_dependents,evidence=excluded.evidence,retired_at=now();

-- Retire only functions whose exact signatures were verified and which have no DB dependents.
drop function if exists public.business_accept_partner_agreement(uuid);
drop function if exists public.business_create_partner_program(text,uuid);
drop function if exists public.business_set_qr_active(uuid,boolean);
drop function if exists public.set_qr_active(uuid,boolean);
drop function if exists public.nearby_locations(double precision,double precision,integer,integer);
drop function if exists public.nearby_locations_enriched(double precision,double precision,integer,integer,uuid[]);
drop function if exists public.nearby_restrooms(double precision,double precision,integer,integer);
