import fs from 'node:fs';

const failures=[];
const required=(path)=>{if(!fs.existsSync(path)){failures.push(`missing ${path}`);return'';}return fs.readFileSync(path,'utf8');};
const migration=required('supabase/migrations/20260912090000_offer_pilot_capability_control_plane.sql');
const sessionMigration=required('supabase/migrations/20260912094000_capability_pilot_sessions.sql');
const assuranceMigration=required('supabase/migrations/20260912124500_offer_launch_assurance_control_plane.sql');
const service=required('apps/platform-mobile/services/capabilityPilot.ts');
const screen=required('apps/platform-mobile/app/pilots.tsx');
const control=required('apps/platform-mobile/app/control.tsx');
const layout=required('apps/platform-mobile/app/_layout.tsx');
const home=required('apps/platform-mobile/app/index.tsx');
const familyService=required('apps/consumer-mobile/services/family.ts');

for(const token of [
  'capability_offer_promises','owner_offer_capability_readiness()','owner_update_capability_offer','sample_enabled','pilot_enabled','pilot_mode','promise_state',
  "('platform_api','Platform REST API'","('platform_webhooks','Platform Webhooks'","('platform_sdk','JavaScript SDK'","('platform_widget','Embeddable Widget'",
  "('platform_map_layer','Map Layer'","('platform_route_sdk','Route SDK'","('platform_mcp','AI / MCP Integration'","('developer_platform','Developer / Integration Platform'",
  "('fleet_employee_benefit','Fleet Employee Premium Benefit'",'"employee_limit":75',"('sponsored_promotion','Sponsored Promotion / Advertising'",
]) if(!migration.includes(token))failures.push(`pilot capability migration missing contract token: ${token}`);

for(const token of ['capability_pilot_sessions','capability_pilot_session_log','owner_pilot_sessions','owner_create_pilot_session','owner_update_pilot_session','sample_profile_snapshot','offer is not pilot ready'])
  if(!sessionMigration.includes(token))failures.push(`pilot session migration missing contract token: ${token}`);

for(const token of [
  "('consumer_family','Consumer Family'",
  '"seat_limit":5',
  'capability_offer_launch_checks',
  'owner_offer_launch_manifest',
  'owner_run_offer_launch_check',
  'owner_offer_launch_history',
  'canonical_audit_issue_count',
  'sample_ready',
  'pilot_ready',
  'production_ready',
  'real_world_demo',
  'developer_portal'
]) if(!assuranceMigration.includes(token))failures.push(`launch assurance migration missing contract token: ${token}`);

for(const token of ['getOfferReadiness','getPilotCapabilityDomains','updateOfferGovernance','updatePilotCapabilityDomain','getPilotSessions','createPilotSession','updatePilotSession','getOfferLaunchManifest','runOfferLaunchCheck','getOfferLaunchHistory'])
  if(!service.includes(token))failures.push(`KleenestOS pilot service missing ${token}`);

for(const token of ['Production ready','Pilot ready','Sample ready','Commercial state','Capability-level pilot controls','People & Access','Start a named pilot','Pilot sessions','Create Pilot Draft','Active pilots','Launch snapshot','Verify sample','Verify pilot','Verify production','Launch assurance','Family · 5 seats','Canonical audit'])
  if(!screen.includes(token))failures.push(`KleenestOS pilot workspace missing UI contract: ${token}`);

if(!layout.includes('<Tabs.Screen name="pilots"'))failures.push('KleenestOS must expose the Pilots workspace as a primary owner control surface');
if(!layout.includes('<Tabs.Screen name="control"'))failures.push('KleenestOS must expose Control Center as a primary mobile tab');
for(const token of [
  'KLEENESTOS CONTROL CENTER',
  'Offer controls',
  'Capability controls',
  'Run sample check',
  'Run pilot check',
  'Run production check',
  'Open sample',
  'Sample enabled',
  'Pilot enabled',
  'Commercial state',
  'Pilot mode',
  'getOfferReadiness',
  'getPilotCapabilityDomains',
  'updateOfferGovernance',
  'updatePilotCapabilityDomain',
  'runOfferLaunchCheck',
  '/notifications',
  '/progression',
  '/businesses',
  '/access',
  '/moderation',
  '/developers',
  '/pilots'
]) if(!control.includes(token))failures.push(`KleenestOS Control Center missing mobile control contract: ${token}`);
if(control.includes('TextInput'))failures.push('KleenestOS Control Center must not require search/text entry to reach global platform controls');
for(const token of ['/pilots','Offers & Pilots','/developers','Developer Platform'])if(!home.includes(token))failures.push(`KleenestOS Home missing owner control route: ${token}`);
for(const token of ['family_has_premium_access','seatsTotal:5'])if(!familyService.includes(token))failures.push(`Consumer Family production evidence missing: ${token}`);

if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('Kleenest pilot/offer capability control-plane audit passed.');
