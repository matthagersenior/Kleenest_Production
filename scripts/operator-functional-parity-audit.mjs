import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing operator workflow: ${path}`);return read(path)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};
const requireAny=(label,source,groups)=>{for(const group of groups)must(group.some(token=>source.includes(token)),`${label}: missing one of ${group.join(' | ')}`)};
const noRawDump=(label,source)=>{must(!source.includes('JSON.stringify('),`${label}: raw JSON presentation is forbidden`);must(!source.includes('style={s.json}'),`${label}: JSON dump styling is forbidden`)};

// A feature counts only when the service authority and an actual operating control are both present.
function mutationSurface({label,service,ui,authority,controls}){
 requireAll(`${label} authority`,service,authority);
 requireAll(`${label} controls`,ui,controls);
}

// FLEET — route creation alone is not parity. Every mutable operational entity must be manageable.
const fleetProduct=requireFile('apps/fleet-mobile/services/product.ts');
const fleetControl=requireFile('apps/fleet-mobile/services/control.ts');
const fleetParity=requireFile('apps/fleet-mobile/services/parity.ts');
const fleetAssets=requireFile('apps/fleet-mobile/app/assets.tsx');
const fleetMaintenance=requireFile('apps/fleet-mobile/app/maintenance.tsx');
const fleetPlanner=requireFile('apps/fleet-mobile/app/planner.tsx');
const fleetDispatch=requireFile('apps/fleet-mobile/app/dispatch.tsx');
const fleetOperations=requireFile('apps/fleet-mobile/app/operations.tsx');
const fleetExecution=requireFile('apps/fleet-mobile/app/execution.tsx');
const fleetSignals=requireFile('apps/fleet-mobile/app/signals.tsx');
const fleetMetrics=requireFile('apps/fleet-mobile/app/metrics.tsx');
const fleetSync=requireFile('apps/fleet-mobile/app/sync.tsx');
const fleetPremium=requireFile('apps/fleet-mobile/app/premium.tsx');
const fleetEnterprise=requireFile('apps/fleet-mobile/app/enterprise.tsx');
const fleetCapabilities=requireFile('apps/fleet-mobile/app/capabilities.tsx');
const fleetService=fleetProduct+'\n'+fleetControl+'\n'+fleetParity;
mutationSurface({label:'Fleet vehicle CRUD',service:fleetService,ui:fleetAssets,authority:['fleet_create_vehicle','fleet_update_vehicle','fleet_delete_vehicle','fleet_set_vehicle_status'],controls:['Add vehicle','Edit vehicle','Delete vehicle']});
mutationSurface({label:'Fleet driver CRUD',service:fleetService,ui:fleetAssets,authority:['fleet_create_driver','fleet_update_driver','fleet_delete_driver','fleet_assign_driver_user','fleet_set_driver_status'],controls:['Add driver','Edit driver','Delete driver','Assign account']});
mutationSurface({label:'Fleet route CRUD',service:fleetService,ui:fleetPlanner+'\n'+fleetDispatch,authority:['fleet_create_route','fleet_update_route','fleet_delete_route','fleet_set_route_stops','fleet_dispatch_route','fleet_set_route_status'],controls:['Create planned route','Save stop order','Edit route','Delete route','Dispatch','Pause','Resume']});
mutationSurface({label:'Fleet maintenance CRUD',service:fleetService,ui:fleetMaintenance,authority:['fleet_create_maintenance','fleet_update_maintenance','fleet_delete_maintenance','fleet_complete_maintenance'],controls:['Schedule maintenance','Edit maintenance','Delete maintenance','Complete maintenance']});
mutationSurface({label:'Fleet exception operations',service:fleetService,ui:fleetOperations+'\n'+fleetExecution,authority:['fleet_exception_alerts','fleet_resolve_alert','fleet_route_exception_drilldown'],controls:['Resolve alert','Route exception']});
mutationSurface({label:'Fleet field execution',service:fleetService,ui:fleetExecution+'\n'+fleetDispatch,authority:['fleet_record_route_stop_timing','fleet_route_geofence_manifest'],controls:['LIVE GEOFENCE TRACKING','Mark arrived','Start service','Complete stop','Skip']});
mutationSurface({label:'Fleet monitoring and Live Network',service:fleetService+fleetSignals,ui:fleetSignals,authority:['fleet_list_monitored_locations','fleet_set_monitored_location','fleet_remove_monitored_location'],controls:['Live Network','Enable Live Network','Stop Live Network','Monitor location','Stop monitoring']});
mutationSurface({label:'Fleet metric configuration',service:fleetService+fleetMetrics,ui:fleetMetrics,authority:['get_fleet_metric_capabilities','create_fleet_metric_definition','update_fleet_metric_definition','assign_fleet_metric'],controls:['Create metric','Edit metric','Assign metric']});
requireAll('Fleet offline/sync UI',fleetSync,['Queued','Sync','Replay']);
mutationSurface({label:'Fleet premium membership',service:fleetService,ui:fleetPremium,authority:['fleet_list_premium_members','fleet_grant_premium_member_by_email','fleet_revoke_premium_member'],controls:['Grant Premium','Revoke']});
requireAll('Fleet Enterprise allocation authority',fleetEnterprise+requireFile('apps/fleet-mobile/services/enterprise.ts'),['createPartnerAllocation','Partner allocation','budget']);
requireAll('Fleet policy controls',fleetCapabilities,['Save dispatch policy','Save exception policy']);
for(const [name,source] of Object.entries({fleetAssets,fleetMaintenance,fleetPlanner,fleetDispatch,fleetOperations,fleetExecution,fleetSignals,fleetMetrics,fleetSync,fleetPremium,fleetEnterprise,fleetCapabilities}))noRawDump(name,source);

// BUSINESS — operational features need end-to-end controls, not analytics cards.
const businessProduct=requireFile('apps/business-mobile/services/product.ts');
const businessWorkflows=requireFile('apps/business-mobile/services/capabilityWorkflows.ts');
const businessQrService=requireFile('apps/business-mobile/services/qrStudio.ts');
const businessLocations=requireFile('apps/business-mobile/app/locations.tsx');
const businessReviews=requireFile('apps/business-mobile/app/reviews.tsx');
const businessQr=requireFile('apps/business-mobile/app/qr-studio.tsx');
const businessQrDesigner=requireFile('apps/business-mobile/app/qr-designer.tsx');
const businessNotifications=requireFile('apps/business-mobile/app/notifications.tsx');
const businessEngagement=requireFile('apps/business-mobile/app/engagement.tsx');
const businessPrevention=requireFile('apps/business-mobile/app/prevention.tsx');
const businessTrust=requireFile('apps/business-mobile/app/trust-operations.tsx');
const businessGovernance=requireFile('apps/business-mobile/app/governance.tsx');
const businessEnterpriseEconomy=requireFile('apps/business-mobile/app/enterprise-economy.tsx');
const businessLive=requireFile('apps/business-mobile/app/live-network.tsx');
const businessService=businessProduct+'\n'+businessWorkflows+'\n'+businessQrService;
mutationSurface({label:'Business location management',service:businessService,ui:businessLocations,authority:['business_manage_location'],controls:['Find & claim an existing place','Edit','Deactivate','Create new location']});
mutationSurface({label:'Business review response',service:businessService,ui:businessReviews,authority:['business_reply_review'],controls:['Reply']});
mutationSurface({label:'Business QR lifecycle',service:businessService,ui:businessQr,authority:['business_create_custom_qr','business_update_custom_qr','business_set_qr_active','business_delete_qr','qr_studio_versions','qr_studio_restore_version','create_qr_engagement_program'],controls:['Create QR asset','Save configuration','Delete','Restore','Create engagement program','Share']});
requireAll('Business QR visual designer',businessQrDesigner,['Foreground color','Background color','Module style','Finder eye style','Quiet zone','Use business logo','Upload custom logo','Logo size','CTA label','Scan readiness']);
requireAll('Business notification operations',businessNotifications,['Compose','Send notification','Audience','Kleenest AI']);
requireAll('Business engagement CRUD',businessEngagement,['Campaign','Promotion','Contest','Event','Create','Edit','Delete']);
requireAll('Business prevention execution',businessPrevention,['verification','Fleet handoff','Assign','Complete']);
requireAll('Business trust operations',businessTrust,['Trust','remediation','Reverification','Action']);
requireAll('Business governance controls',businessGovernance,['Report','Run due','Export']);
requireAll('Business Enterprise economy',businessEnterpriseEconomy,['Allocation','budget','Activate','ROI']);
requireAny('Business Live Network controls',businessLive,[['Enable Live Network','Start Live Network'],['Disable Live Network','Stop Live Network']]);
for(const [name,source] of Object.entries({businessLocations,businessReviews,businessQr,businessQrDesigner,businessNotifications,businessEngagement,businessPrevention,businessTrust,businessGovernance,businessEnterpriseEconomy,businessLive}))noRawDump(name,source);

// KLEENESTOS / OWNER — observability is not administration. Mutable platform domains require commands.
const ownerProduct=requireFile('apps/platform-mobile/services/product.ts');
const ownerAdmin=requireFile('apps/platform-mobile/services/ownerAdmin.ts');
const ownerAccess=requireFile('apps/platform-mobile/app/access.tsx');
const ownerBusinesses=requireFile('apps/platform-mobile/app/businesses.tsx');
const ownerProgression=requireFile('apps/platform-mobile/app/progression.tsx');
const ownerData=requireFile('apps/platform-mobile/app/data.tsx');
const ownerModeration=requireFile('apps/platform-mobile/app/moderation.tsx');
const ownerOperations=requireFile('apps/platform-mobile/app/operations.tsx');
const ownerCapabilities=requireFile('apps/platform-mobile/app/capabilities.tsx');
const ownerService=ownerProduct+'\n'+ownerAdmin;
mutationSurface({label:'Owner people access',service:ownerService,ui:ownerAccess,authority:['admin_user_search','admin_set_user_access'],controls:['Search','Apply authoritative access']});
mutationSurface({label:'Owner business access',service:ownerService,ui:ownerBusinesses,authority:['admin_set_business_verification','admin_set_business_access','admin_assign_business_member','admin_remove_business_member'],controls:['Verify','Reject','Fleet enabled','Enterprise enabled','Add member','Remove member']});
mutationSurface({label:'Owner progression economy',service:ownerService,ui:ownerProgression,authority:['owner_progression_xp_action_catalog','owner_update_progression_xp_action','owner_progression_objective_list','owner_progression_objective_upsert','owner_progression_objective_set_status','owner_progression_objective_delete','owner_progression_supply_status'],controls:['Economy & Progression Studio','Create objective','Edit XP','Activate objective','Pause objective','Archive objective','Delete objective','Refresh progression supply']});
mutationSurface({label:'Owner data CRUD gateway',service:ownerService,ui:ownerData,authority:['admin_crud_gateway'],controls:['Create record','Edit record','Delete record']});
requireAll('Owner moderation decisions',ownerModeration,['Resolve','Dismiss','Reviewing']);
requireAll('Owner ingestion controls',ownerOperations,['Run one cycle','Repair stalled cells','Save storage guard','Save source policy']);
requireAll('Owner capability governance',ownerCapabilities,['Run live audit','Active canonical domain','Requires app surface','Open owning workflow']);
for(const [name,source] of Object.entries({ownerAccess,ownerBusinesses,ownerProgression,ownerData,ownerModeration,ownerOperations,ownerCapabilities}))noRawDump(name,source);

if(failures.length){
 console.error(`Operator functional parity audit failed with ${failures.length} gap(s):`);
 failures.forEach(f=>console.error(`- ${f}`));
 process.exit(1);
}
console.log('Operator functional parity audit passed: Business, Fleet and KleenestOS mutable domains expose wired operating controls.');
