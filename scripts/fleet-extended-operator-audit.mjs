import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const all=(label,source,tokens)=>tokens.forEach(token=>{if(!source.includes(token))failures.push(`${label}: missing ${token}`)});
const noRaw=(label,source)=>{if(/<Text[^>]*>\s*\{JSON\.stringify\(/m.test(source)||source.includes('style={s.json}'))failures.push(`${label}: raw JSON operator output is forbidden`)};

const service=read('apps/fleet-mobile/services/parity.ts')+'\n'+read('apps/fleet-mobile/services/product.ts')+'\n'+read('apps/fleet-mobile/services/control.ts');
const geofence=read('apps/fleet-mobile/services/geofence.ts');
const assets=read('apps/fleet-mobile/app/assets.tsx');
const planner=read('apps/fleet-mobile/app/planner.tsx');
const dispatch=read('apps/fleet-mobile/app/dispatch.tsx');
const maintenance=read('apps/fleet-mobile/app/maintenance.tsx');
const operations=read('apps/fleet-mobile/app/operations.tsx');
const metrics=read('apps/fleet-mobile/app/metrics.tsx');
const capabilities=read('apps/fleet-mobile/app/capabilities.tsx');
const entitlementMigration=read('supabase/migrations/20260907224500_fleet_entitlement_authority_convergence.sql');

all('Vehicle authority',service,['fleet_create_vehicle','fleet_update_vehicle','fleet_delete_vehicle','fleet_set_vehicle_status']);
all('Vehicle controls',assets,['Add vehicle','Edit vehicle','Delete vehicle']);
all('Driver authority',service,['fleet_create_driver','fleet_update_driver','fleet_delete_driver','fleet_assign_driver_user','fleet_set_driver_status']);
all('Driver controls',assets,['Add driver','Edit driver','Delete driver','Assign account']);
all('Route authority',service,['fleet_create_route','fleet_update_route','fleet_delete_route','fleet_set_route_stops','fleet_dispatch_route','fleet_set_route_status']);
all('Planner controls',planner,['Create planned route','Save stop order','Edit route','Delete route']);
all('Dispatch controls',dispatch,['Dispatch','Pause','Resume']);
all('Dispatch workspace authority',dispatch,['currentFleetBusinessId']);
if(dispatch.includes('listFleetWorkspaces')||dispatch.includes('spaces[0]'))failures.push('Dispatch workspace authority: bypasses canonical Fleet workspace selection');
all('Maintenance authority',service,['fleet_create_maintenance','fleet_update_maintenance','fleet_delete_maintenance','fleet_complete_maintenance']);
all('Maintenance controls',maintenance,['Schedule maintenance','Edit maintenance','Delete maintenance','Complete maintenance']);
all('Metric authority',service,['get_fleet_metric_capabilities','get_fleet_metric_configuration','create_fleet_metric_definition','update_fleet_metric_definition','assign_fleet_metric']);
all('Metric controls',metrics,['Create metric','Edit metric','Assign metric']);
all('Operational bridge authority',service,['record_fleet_operational_event','fleet_preventive_dispatch_opportunities','fleet_attach_preventive_work_to_route']);
all('Operational bridge controls',operations,['attachPreventiveWorkToRoute','Resolve alert']);
all('Operational resilience',service,['Promise.allSettled','alertsWarning']);

// Fleet access must converge on the canonical product-access entitlement instead of duplicating an older tier-only rule.
all('Fleet entitlement authority',entitlementMigration,['business_fleet_authorized','get_business_product_access','fleet_enabled']);
if(entitlementMigration.includes("business_tier::text in ('fleet','enterprise')"))failures.push('Fleet entitlement authority: tier-only Fleet authorization is obsolete; canonical fleet_enabled must decide access');

// Capabilities are an operator surface: no raw UUID/business_id dumps or machine field names as primary UX.
all('Fleet capability presentation',capabilities,['formatFleetCapabilityLabel','formatFleetCapabilityValue','isFleetInternalField']);
if(capabilities.includes('key.replaceAll(\'_\',\' \')'))failures.push('Fleet capability presentation: generic raw field rendering is forbidden');
if(capabilities.includes('<Text style={s.factValue}>{String(val)}</Text>'))failures.push('Fleet capability presentation: raw backend values are forbidden');

// Validate behavior rather than brittle formatting. Android requestId values must stay short,
// while the full UUID context is persisted separately for background callbacks.
if(!/\bGEOFENCE_CONTEXT_KEY\b/.test(geofence))failures.push('Android geofence identifier safety: missing persisted context key');
if(!/identifier\s*=\s*`kf:\$\{row\.route_stop_id\}`/.test(geofence))failures.push('Android geofence identifier safety: missing compact route-stop identifier');
if(!/AsyncStorage\.setItem\s*\(\s*GEOFENCE_CONTEXT_KEY\b/.test(geofence))failures.push('Android geofence identifier safety: missing persisted geofence context');
if(/identifier\s*=\s*[^;\n]*\.join\(\s*['"]\|['"]\s*\)/.test(geofence))failures.push('Android geofence identifier safety: UUID tuple identifiers exceed the native requestId limit');

all('Refresh convergence',assets+planner+dispatch+maintenance+metrics+operations,['await load()']);
for(const [label,source] of Object.entries({assets,planner,dispatch,maintenance,operations,metrics,capabilities}))noRaw(label,source);

if(failures.length){console.error(`Fleet extended operator audit failed with ${failures.length} issue${failures.length===1?'':'s'}:`);failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log('Fleet extended operator audit passed: vehicle, driver, route, maintenance, metric and operational CRUD authority is wired to resilient human operator controls with canonical entitlement, Android-safe geofencing, canonical workspace selection and refresh convergence.');
