-- Canonical promise/readiness and pilot governance for KleenestOS.
-- This extends the existing capability registry rather than creating a parallel feature authority.

alter table public.capability_domain_contracts
  add column if not exists sample_enabled boolean not null default false,
  add column if not exists pilot_enabled boolean not null default false,
  add column if not exists pilot_mode text not null default 'off',
  add column if not exists promise_state text not null default 'internal';

alter table public.capability_domain_contracts
  drop constraint if exists capability_domain_contracts_pilot_mode_check,
  add constraint capability_domain_contracts_pilot_mode_check
    check (pilot_mode in ('off','sample','sandbox','limited-live','live')),
  drop constraint if exists capability_domain_contracts_promise_state_check,
  add constraint capability_domain_contracts_promise_state_check
    check (promise_state in ('internal','sample','pilot','offered','production','gated','unavailable'));

update public.capability_domain_contracts
set sample_enabled = case
      when release_state in ('retired','disabled') then false
      else true
    end,
    pilot_enabled = case
      when release_state in ('enabled','mixed','play-gated') then true
      else false
    end,
    pilot_mode = case
      when release_state='enabled' and exposure_state in ('surface','shared-service') then 'limited-live'
      when release_state in ('mixed','play-gated') then 'sandbox'
      when release_state='enabled' then 'sample'
      else 'off'
    end,
    promise_state = case
      when release_state='enabled' and exposure_state in ('surface','shared-service') then 'production'
      when release_state in ('mixed','play-gated') then 'gated'
      when release_state='enabled' then 'offered'
      when release_state='internal-only' then 'internal'
      else 'unavailable'
    end
where true;

-- External platform capabilities that are already live but were not represented as first-class domains.
insert into public.capability_domain_contracts(
  domain,canonical_capability,canonical_rpc,owner_surface,active,notes,
  owner_workspace,owner_route,exposure_state,release_state,requires_surface,source_repos,
  sample_enabled,pilot_enabled,pilot_mode,promise_state
) values
('platform_api','Platform REST API','map_network_nearby_v3','platform',true,'Public nearby recommendation API used by partners, SDKs and integrations.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'live','production'),
('platform_route_api','Platform Route API','map_network_along_route_v1','platform',true,'Public along-route recommendation API.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'live','production'),
('platform_partner_access','Developer Partner Workspaces','platform_member_partner_summary','platform',true,'Partner workspace, membership and scoped developer administration.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'limited-live','production'),
('platform_browser_tokens','Browser Publishable Tokens','issue_platform_member_publishable_token','platform',true,'Origin-bound browser token issuance for client integrations.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'limited-live','production'),
('platform_webhooks','Platform Webhooks','create_platform_member_webhook_endpoint','platform',true,'Partner webhook endpoint lifecycle and signed event delivery.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'limited-live','production'),
('platform_developer_portal','Developer Portal','platform_user_partner_memberships','platform',true,'Developer signup, invite claim, workspace and integration management portal.','platform-mobile','/capabilities','surface','enabled',true,array['Kleenest_Production'],true,true,'live','production'),
('platform_sdk','JavaScript SDK','map_network_nearby_v3','platform',true,'Packaged JavaScript SDK over the canonical platform API.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'live','production'),
('platform_widget','Embeddable Widget','map_network_nearby_v3','platform',true,'Embeddable restroom finder widget backed by the platform API.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'live','production'),
('platform_map_layer','Map Layer','map_network_nearby_v3','platform',true,'GeoJSON map-layer integration for partner maps.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'live','production'),
('platform_route_sdk','Route SDK','map_network_along_route_v1','platform',true,'Route-aware SDK integration for next-stop and along-route restroom intelligence.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'live','production'),
('platform_mcp','AI / MCP Integration','map_network_nearby_v3','platform',true,'AI-agent integration surface delegating to canonical recommendation APIs.','platform-mobile','/capabilities','shared-service','enabled',false,array['Kleenest_Production'],true,true,'limited-live','production')
on conflict(domain) do update set
  canonical_capability=excluded.canonical_capability,
  canonical_rpc=excluded.canonical_rpc,
  owner_surface=excluded.owner_surface,
  owner_workspace=excluded.owner_workspace,
  owner_route=excluded.owner_route,
  exposure_state=excluded.exposure_state,
  release_state=excluded.release_state,
  requires_surface=excluded.requires_surface,
  active=excluded.active,
  notes=excluded.notes,
  sample_enabled=excluded.sample_enabled,
  pilot_enabled=excluded.pilot_enabled,
  pilot_mode=excluded.pilot_mode,
  promise_state=excluded.promise_state,
  updated_at=now();

create table if not exists public.capability_offer_promises(
  id uuid primary key default gen_random_uuid(),
  offer_key text not null unique,
  label text not null,
  audience text not null,
  description text not null,
  required_domains text[] not null default '{}',
  active boolean not null default true,
  sample_enabled boolean not null default true,
  pilot_enabled boolean not null default false,
  pilot_mode text not null default 'sandbox',
  commercial_state text not null default 'pilot',
  sample_profile jsonb not null default '{}'::jsonb,
  owner_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_offer_promises_audience_check check(audience in ('consumer','business','fleet','enterprise','developer','cross-platform')),
  constraint capability_offer_promises_pilot_mode_check check(pilot_mode in ('off','sample','sandbox','limited-live','live')),
  constraint capability_offer_promises_commercial_state_check check(commercial_state in ('sample','pilot','offered','production','gated','retired'))
);

alter table public.capability_offer_promises enable row level security;
revoke all on table public.capability_offer_promises from public,anon,authenticated;
grant select,insert,update,delete on table public.capability_offer_promises to service_role;
drop policy if exists capability_offer_promises_client_deny on public.capability_offer_promises;
create policy capability_offer_promises_client_deny on public.capability_offer_promises
  for all to anon,authenticated using(false) with check(false);

create table if not exists public.capability_offer_governance_log(
  id uuid primary key default gen_random_uuid(),
  offer_key text not null,
  changed_by uuid,
  reason text,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now()
);
alter table public.capability_offer_governance_log enable row level security;
revoke all on table public.capability_offer_governance_log from public,anon,authenticated;
grant select,insert on table public.capability_offer_governance_log to service_role;
drop policy if exists capability_offer_governance_log_client_deny on public.capability_offer_governance_log;
create policy capability_offer_governance_log_client_deny on public.capability_offer_governance_log
  for all to anon,authenticated using(false) with check(false);

insert into public.capability_offer_promises(
  offer_key,label,audience,description,required_domains,active,sample_enabled,pilot_enabled,pilot_mode,commercial_state,sample_profile,owner_notes
) values
('consumer_network','Free Consumer Network','consumer','Find trusted restroom locations, route to them, check in, contribute evidence and reviews, save places, receive notifications and participate in progression.',array['location_discovery','route_planning','consumer_checkins','consumer_observations','consumer_reviews','consumer_saved_locations','notifications','progression'],true,true,true,'limited-live','production','{"entry_route":"/explore","scenario":"St. Louis / KC-to-Chicago network demo"}'::jsonb,'Primary adoption engine; keep free consumer utility demonstrable at all times.'),
('consumer_premium','Consumer Premium','consumer','Premium consumer experience including enhanced saved/preferred locations, offline capability and paid membership state.',array['preferred_locations','offline_maps','membership_billing'],true,true,true,'sandbox','pilot','{"entry_route":"/membership","scenario":"Premium feature pilot without live Play purchase"}'::jsonb,'Pilot-ready; production monetization remains gated by Play Billing completion.'),
('business_operations','Business Operations','business','Claim/manage locations, amenities, teams and reviews with operational controls.',array['business','business_management','business_amenities','business_membership','business_reviews'],true,true,true,'limited-live','production','{"entry_route":"/","scenario":"Business owner location operations demo"}'::jsonb,null),
('business_growth','Business Growth & Analytics','business','Analytics, QR engagement, promotions, campaigns and contests for business growth.',array['business_analytics','business_marketing','business_qr','business_promotions','business_campaigns','business_contests'],true,true,true,'limited-live','production','{"entry_route":"/growth","scenario":"QR-to-engagement-to-analytics loop"}'::jsonb,null),
('sponsored_promotion','Sponsored Promotion / Advertising','business','Business-funded campaigns and promotions with measurable engagement/analytics as the initial advertising product.',array['business_campaigns','business_promotions','business_analytics','business_qr'],true,true,true,'limited-live','production','{"entry_route":"/growth","scenario":"Sponsored campaign and measurable QR engagement"}'::jsonb,'Advertising promise is grounded in campaign/promotion inventory and analytics, not an unimplemented ad exchange.'),
('qr_engagement','QR Engagement Network','business','QR check-in, attribution, campaigns, review/reverification and engagement loops.',array['business_qr','business_marketing','consumer_checkins','consumer_evidence'],true,true,true,'limited-live','production','{"entry_route":"/qr-studio","scenario":"Scan -> check-in/evidence -> attribution"}'::jsonb,null),
('fleet_operations','Fleet Operations & Routing','fleet','Fleet dispatch, routes, drivers/assets, alerts, maintenance, metrics, analytics and leaderboards.',array['fleet','fleet_routes','fleet_crud','fleet_operations','fleet_maintenance','fleet_metrics','fleet_analytics','fleet_leaderboards'],true,true,true,'limited-live','production','{"entry_route":"/dispatch","sample_business_name":"Kleenest Fleet Dispatch Hub"}'::jsonb,null),
('fleet_employee_benefit','Fleet Employee Premium Benefit','fleet','Employer/fleet package that includes Consumer Premium access for up to 75 people alongside fleet operations.',array['fleet_management','membership_billing','fleet_operations'],true,true,true,'sandbox','pilot','{"entry_route":"/","employee_limit":75,"scenario":"Employer benefit pilot"}'::jsonb,'Operationally pilotable; paid consumer entitlement commercialization remains Play-gated.'),
('enterprise_partnerships','Enterprise Partnerships','enterprise','Enterprise partner programs, campaigns, allocations, outcomes and fleet-enabled network operations.',array['enterprise_partnerships','fleet_management','business_analytics','network_intelligence'],true,true,true,'limited-live','production','{"entry_route":"/enterprise","scenario":"Enterprise partner outcomes / ROI pilot"}'::jsonb,null),
('developer_platform','Developer / Integration Platform','developer','REST API, JavaScript SDK, Widget, Map Layer, Route SDK, Webhooks, browser tokens, Developer Portal and MCP/AI integrations.',array['platform_api','platform_route_api','platform_partner_access','platform_browser_tokens','platform_webhooks','platform_developer_portal','platform_sdk','platform_widget','platform_map_layer','platform_route_sdk','platform_mcp'],true,true,true,'live','production','{"partner_slug":"kleenest-internal-development","portal":"https://matthagersenior.github.io/Kleenest_Production/developer/","scenario":"Internal sandbox partner integration"}'::jsonb,'Canonical external platform offer; production smoke continuously validates the integration path.')
on conflict(offer_key) do update set
  label=excluded.label,
  audience=excluded.audience,
  description=excluded.description,
  required_domains=excluded.required_domains,
  sample_profile=excluded.sample_profile,
  owner_notes=coalesce(public.capability_offer_promises.owner_notes,excluded.owner_notes),
  updated_at=now();

create or replace function public.owner_offer_capability_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  with expanded as (
    select o.*, d.domain required_domain, c.id is not null domain_exists, c.active domain_active,
           c.canonical_rpc,c.release_state,c.requires_surface,c.owner_route,c.sample_enabled domain_sample_enabled,
           c.pilot_enabled domain_pilot_enabled,c.pilot_mode domain_pilot_mode,c.promise_state,
           case when c.id is null then false else exists(
             select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname=c.canonical_rpc
           ) end rpc_exists
    from public.capability_offer_promises o
    cross join lateral unnest(o.required_domains) d(domain)
    left join public.capability_domain_contracts c on c.domain=d.domain
  ), rollup as (
    select offer_key,max(label) label,max(audience) audience,max(description) description,
           bool_or(active) active,bool_or(sample_enabled) sample_enabled,bool_or(pilot_enabled) pilot_enabled,
           max(pilot_mode) pilot_mode,max(commercial_state) commercial_state,max(sample_profile::text)::jsonb sample_profile,
           max(owner_notes) owner_notes,
           array_agg(required_domain order by required_domain) required_domains,
           coalesce(array_agg(required_domain order by required_domain) filter(where not domain_exists),'{}'::text[]) missing_domains,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and not domain_active),'{}'::text[]) inactive_domains,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and not rpc_exists),'{}'::text[]) missing_rpcs,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and release_state in ('disabled','retired')),'{}'::text[]) release_blockers,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and release_state <> 'enabled'),'{}'::text[]) production_gates,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and requires_surface and owner_route is null),'{}'::text[]) surface_gaps,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and not domain_sample_enabled),'{}'::text[]) sample_disabled_domains,
           coalesce(array_agg(required_domain order by required_domain) filter(where domain_exists and not domain_pilot_enabled),'{}'::text[]) pilot_disabled_domains
    from expanded group by offer_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'offer_key',offer_key,'label',label,'audience',audience,'description',description,'active',active,
    'sample_enabled',sample_enabled,'pilot_enabled',pilot_enabled,'pilot_mode',pilot_mode,'commercial_state',commercial_state,
    'sample_profile',sample_profile,'owner_notes',owner_notes,'required_domains',required_domains,
    'missing_domains',missing_domains,'inactive_domains',inactive_domains,'missing_rpcs',missing_rpcs,
    'release_blockers',release_blockers,'production_gates',production_gates,'surface_gaps',surface_gaps,
    'sample_disabled_domains',sample_disabled_domains,'pilot_disabled_domains',pilot_disabled_domains,
    'sample_ready', active and sample_enabled and cardinality(missing_domains)=0 and cardinality(inactive_domains)=0 and cardinality(missing_rpcs)=0 and cardinality(release_blockers)=0 and cardinality(sample_disabled_domains)=0,
    'pilot_ready', active and pilot_enabled and cardinality(missing_domains)=0 and cardinality(inactive_domains)=0 and cardinality(missing_rpcs)=0 and cardinality(release_blockers)=0 and cardinality(pilot_disabled_domains)=0,
    'production_ready', active and cardinality(missing_domains)=0 and cardinality(inactive_domains)=0 and cardinality(missing_rpcs)=0 and cardinality(production_gates)=0 and cardinality(surface_gaps)=0
  ) order by offer_key),'[]'::jsonb) into v_result
  from rollup;
  return v_result;
end;
$function$;

revoke all on function public.owner_offer_capability_readiness() from public,anon;
grant execute on function public.owner_offer_capability_readiness() to authenticated,service_role;

create or replace function public.owner_update_capability_offer(p_offer_key text,p_patch jsonb,p_reason text default 'KleenestOS offer governance update')
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb;v_after jsonb;v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(v_patch) k where k not in ('active','sample_enabled','pilot_enabled','pilot_mode','commercial_state','owner_notes','sample_profile')) then
    raise exception 'unsupported offer governance field';
  end if;
  if v_patch?'pilot_mode' and coalesce(v_patch->>'pilot_mode','') not in ('off','sample','sandbox','limited-live','live') then raise exception 'invalid pilot mode'; end if;
  if v_patch?'commercial_state' and coalesce(v_patch->>'commercial_state','') not in ('sample','pilot','offered','production','gated','retired') then raise exception 'invalid commercial state'; end if;
  select to_jsonb(o) into v_before from public.capability_offer_promises o where o.offer_key=p_offer_key for update;
  if v_before is null then raise exception 'unknown capability offer'; end if;
  update public.capability_offer_promises o set
    active=case when v_patch?'active' then (v_patch->>'active')::boolean else o.active end,
    sample_enabled=case when v_patch?'sample_enabled' then (v_patch->>'sample_enabled')::boolean else o.sample_enabled end,
    pilot_enabled=case when v_patch?'pilot_enabled' then (v_patch->>'pilot_enabled')::boolean else o.pilot_enabled end,
    pilot_mode=case when v_patch?'pilot_mode' then v_patch->>'pilot_mode' else o.pilot_mode end,
    commercial_state=case when v_patch?'commercial_state' then v_patch->>'commercial_state' else o.commercial_state end,
    owner_notes=case when v_patch?'owner_notes' then nullif(trim(v_patch->>'owner_notes'),'') else o.owner_notes end,
    sample_profile=case when v_patch?'sample_profile' then coalesce(v_patch->'sample_profile','{}'::jsonb) else o.sample_profile end,
    updated_at=now()
  where o.offer_key=p_offer_key;
  select to_jsonb(o) into v_after from public.capability_offer_promises o where o.offer_key=p_offer_key;
  insert into public.capability_offer_governance_log(offer_key,changed_by,reason,previous_state,next_state)
  values(p_offer_key,auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return v_after;
end;
$function$;
revoke all on function public.owner_update_capability_offer(text,jsonb,text) from public,anon;
grant execute on function public.owner_update_capability_offer(text,jsonb,text) to authenticated,service_role;

create or replace function public.owner_capability_domain_contracts()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'domain',c.domain,'canonical_capability',c.canonical_capability,'canonical_rpc',c.canonical_rpc,
    'owner_surface',c.owner_surface,'owner_workspace',c.owner_workspace,'owner_route',c.owner_route,'active',c.active,
    'exposure_state',c.exposure_state,'release_state',c.release_state,'requires_surface',c.requires_surface,
    'source_repos',c.source_repos,'notes',c.notes,'sample_enabled',c.sample_enabled,'pilot_enabled',c.pilot_enabled,
    'pilot_mode',c.pilot_mode,'promise_state',c.promise_state,
    'rpc_exists',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc),
    'authenticated_execute',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc and has_function_privilege('authenticated',p.oid,'EXECUTE')),
    'anon_execute',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=c.canonical_rpc and has_function_privilege('anon',p.oid,'EXECUTE')),
    'updated_at',c.updated_at
  ) order by c.domain),'[]'::jsonb) into v_result from public.capability_domain_contracts c;
  return v_result;
end;
$function$;

create or replace function public.owner_update_capability_domain_contract(p_domain text,p_patch jsonb,p_reason text default 'KleenestOS capability governance update')
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb;v_after jsonb;v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if coalesce(nullif(trim(p_domain),''),'')='' then raise exception 'domain is required'; end if;
  if exists(select 1 from jsonb_object_keys(v_patch) k where k not in ('active','owner_surface','owner_workspace','owner_route','exposure_state','release_state','requires_surface','notes','sample_enabled','pilot_enabled','pilot_mode','promise_state')) then raise exception 'unsupported capability governance field'; end if;
  if v_patch?'exposure_state' and coalesce(v_patch->>'exposure_state','') not in ('surface','server-support','shared-service','release-gated') then raise exception 'invalid exposure state'; end if;
  if v_patch?'release_state' and coalesce(v_patch->>'release_state','') not in ('enabled','internal-only','mixed','play-gated','disabled','retired') then raise exception 'invalid release state'; end if;
  if v_patch?'pilot_mode' and coalesce(v_patch->>'pilot_mode','') not in ('off','sample','sandbox','limited-live','live') then raise exception 'invalid pilot mode'; end if;
  if v_patch?'promise_state' and coalesce(v_patch->>'promise_state','') not in ('internal','sample','pilot','offered','production','gated','unavailable') then raise exception 'invalid promise state'; end if;
  select to_jsonb(c) into v_before from public.capability_domain_contracts c where c.domain=p_domain limit 1 for update;
  if v_before is null then raise exception 'unknown capability domain'; end if;
  update public.capability_domain_contracts c set
    active=case when v_patch?'active' then (v_patch->>'active')::boolean else c.active end,
    owner_surface=case when v_patch?'owner_surface' then coalesce(nullif(trim(v_patch->>'owner_surface'),''),c.owner_surface) else c.owner_surface end,
    owner_workspace=case when v_patch?'owner_workspace' then nullif(trim(v_patch->>'owner_workspace'),'') else c.owner_workspace end,
    owner_route=case when v_patch?'owner_route' then nullif(trim(v_patch->>'owner_route'),'') else c.owner_route end,
    exposure_state=case when v_patch?'exposure_state' then v_patch->>'exposure_state' else c.exposure_state end,
    release_state=case when v_patch?'release_state' then v_patch->>'release_state' else c.release_state end,
    requires_surface=case when v_patch?'requires_surface' then (v_patch->>'requires_surface')::boolean else c.requires_surface end,
    notes=case when v_patch?'notes' then nullif(trim(v_patch->>'notes'),'') else c.notes end,
    sample_enabled=case when v_patch?'sample_enabled' then (v_patch->>'sample_enabled')::boolean else c.sample_enabled end,
    pilot_enabled=case when v_patch?'pilot_enabled' then (v_patch->>'pilot_enabled')::boolean else c.pilot_enabled end,
    pilot_mode=case when v_patch?'pilot_mode' then v_patch->>'pilot_mode' else c.pilot_mode end,
    promise_state=case when v_patch?'promise_state' then v_patch->>'promise_state' else c.promise_state end,
    updated_at=now()
  where c.domain=p_domain;
  select to_jsonb(c) into v_after from public.capability_domain_contracts c where c.domain=p_domain limit 1;
  insert into public.capability_domain_governance_log(domain,changed_by,reason,previous_state,next_state)
  values(p_domain,auth.uid(),nullif(trim(p_reason),''),v_before,v_after);
  return v_after;
end;
$function$;

-- Existing function ACLs are preserved by CREATE OR REPLACE; reassert intended owner-app execution.
revoke all on function public.owner_capability_domain_contracts() from public,anon;
grant execute on function public.owner_capability_domain_contracts() to authenticated,service_role;
revoke all on function public.owner_update_capability_domain_contract(text,jsonb,text) from public,anon;
grant execute on function public.owner_update_capability_domain_contract(text,jsonb,text) to authenticated,service_role;
