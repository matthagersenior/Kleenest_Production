import fs from 'node:fs';

const failures=[];
const required=(path)=>{if(!fs.existsSync(path)){failures.push(`missing ${path}`);return'';}return fs.readFileSync(path,'utf8');};
const migration=required('supabase/migrations/20260912090000_offer_pilot_capability_control_plane.sql');
const service=required('apps/platform-mobile/services/capabilityPilot.ts');
const screen=required('apps/platform-mobile/app/pilots.tsx');
const layout=required('apps/platform-mobile/app/_layout.tsx');

for(const token of [
  'capability_offer_promises',
  'owner_offer_capability_readiness()',
  'owner_update_capability_offer',
  'sample_enabled',
  'pilot_enabled',
  'pilot_mode',
  'promise_state',
  "('platform_api','Platform REST API'",
  "('platform_webhooks','Platform Webhooks'",
  "('platform_sdk','JavaScript SDK'",
  "('platform_widget','Embeddable Widget'",
  "('platform_map_layer','Map Layer'",
  "('platform_route_sdk','Route SDK'",
  "('platform_mcp','AI / MCP Integration'",
  "('developer_platform','Developer / Integration Platform'",
  "('fleet_employee_benefit','Fleet Employee Premium Benefit'",
  '"employee_limit":75',
  "('sponsored_promotion','Sponsored Promotion / Advertising'",
]) if(!migration.includes(token))failures.push(`pilot capability migration missing contract token: ${token}`);

for(const token of ['getOfferReadiness','getPilotCapabilityDomains','updateOfferGovernance','updatePilotCapabilityDomain'])
  if(!service.includes(token))failures.push(`KleenestOS pilot service missing ${token}`);

for(const token of ['Production ready','Pilot ready','Sample ready','Commercial state','Capability-level pilot controls','People & Access'])
  if(!screen.includes(token))failures.push(`KleenestOS pilot workspace missing UI contract: ${token}`);

if(!layout.includes('<Tabs.Screen name="pilots"'))failures.push('KleenestOS must expose the Pilots workspace as a primary owner control surface');

if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('Kleenest pilot/offer capability control-plane audit passed.');
