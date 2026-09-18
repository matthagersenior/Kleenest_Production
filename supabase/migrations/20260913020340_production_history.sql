-- Register live Place Match / Place Intelligence as a first-class governed platform capability.
-- The REST endpoint and service-role matcher already exist; this migration brings the capability catalog,
-- offer readiness, pilot/sample governance and KleenestOS into parity with the shipped platform surface.

insert into public.capability_domain_contracts(
  domain,canonical_capability,canonical_rpc,owner_surface,active,notes,
  owner_workspace,owner_route,exposure_state,release_state,requires_surface,source_repos,
  sample_enabled,pilot_enabled,pilot_mode,promise_state
)
select
  'platform_place_match',
  'Place Match / Place Intelligence',
  'platform_match_places',
  'platform',
  true,
  'Read-only partner place resolution to canonical Kleenest locations. Exposed through POST /v1/places/match and the JavaScript SDK.',
  'platform-mobile',
  '/developers',
  'shared-service',
  'enabled',
  false,
  array['Kleenest_Production']::text[],
  true,
  true,
  'live',
  'production'
where not exists(
  select 1 from public.capability_domain_contracts where domain='platform_place_match'
);

update public.capability_domain_contracts
set
  canonical_capability='Place Match / Place Intelligence',
  canonical_rpc='platform_match_places',
  owner_surface='platform',
  active=true,
  notes='Read-only partner place resolution to canonical Kleenest locations. Exposed through POST /v1/places/match and the JavaScript SDK.',
  owner_workspace='platform-mobile',
  owner_route='/developers',
  exposure_state='shared-service',
  release_state='enabled',
  requires_surface=false,
  source_repos=array['Kleenest_Production']::text[],
  sample_enabled=true,
  pilot_enabled=true,
  pilot_mode='live',
  promise_state='production',
  updated_at=now()
where domain='platform_place_match';

update public.capability_offer_promises
set
  description='REST API, nearby and route recommendations, Place Match / Place Intelligence, JavaScript SDK, Widget, Map Layer, Route SDK, Webhooks, browser tokens, Developer Portal and MCP/AI integrations.',
  required_domains=case
    when 'platform_place_match'=any(required_domains) then required_domains
    else array_append(required_domains,'platform_place_match')
  end,
  sample_profile=jsonb_set(
    jsonb_set(
      coalesce(sample_profile,'{}'::jsonb),
      '{sample_capabilities}',
      '["nearby","route","place_details","place_match","sdk","widget","map_layer","route_sdk","webhooks","mcp"]'::jsonb,
      true
    ),
    '{place_match}',
    '{"enabled":true,"route":"/v1/places/match"}'::jsonb,
    true
  ),
  updated_at=now()
where offer_key='developer_platform';
