import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing canonical operator workflow: ${path}`);return read(path)};
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};
const requireAny=(label,source,groups)=>{for(const group of groups)must(group.some(token=>source.includes(token)),`${label}: missing one of ${group.join(' | ')}`)};
const noRawDump=(label,source)=>{must(!/<Text[^>]*>\s*\{JSON\.stringify\(/m.test(source),`${label}: raw JSON text presentation is forbidden`);must(!source.includes('style={s.json}'),`${label}: JSON dump styling is forbidden`)};
function mutationSurface({label,service,ui,authority,controls}){requireAll(`${label} authority`,service,authority);requireAll(`${label} controls`,ui,controls);}

// FLEET — protect the complete operator chain, not route names from the standalone source repo.
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
const fleetEnterpriseService=requireFile('apps/fleet-mobile/services/enterprise.ts');
const fleetService=fleetProduct+'\n'+fleetControl+'\n'+fleetParity;
mutationSurface({label:'Fleet vehicle CRUD',service:fleetService,ui:fleetAssets,authority:['fleet_create_vehicle','fleet_update_vehicle','fleet_delete_vehicle','fleet_set_vehicle_status'],controls:['Add vehicle','Edit vehicle','Delete vehicle']});
mutationSurface({label:'Fleet driver CRUD',service:fleetService,ui:fleetAssets,authority:['fleet_create_driver','fleet_update_driver','fleet_delete_driver','fleet_assign_driver_user','fleet_set_driver_status'],controls:['Add driver','Edit driver','Delete driver','Assign account']});
mutationSurface({label:'Fleet route CRUD and dispatch',service:fleetService,ui:fleetPlanner+'\n'+fleetDispatch,authority:['fleet_create_route','fleet_update_route','fleet_delete_route','fleet_set_route_stops','fleet_dispatch_route','fleet_set_route_status'],controls:['Create planned route','Save stop order','Edit route','Delete route','Dispatch','Pause','Resume']});
mutationSurface({label:'Fleet maintenance CRUD',service:fleetService,ui:fleetMaintenance,authority:['fleet_create_maintenance','fleet_update_maintenance','fleet_delete_maintenance','fleet_complete_maintenance'],controls:['Schedule maintenance','Edit maintenance','Delete maintenance','Complete maintenance']});
mutationSurface({label:'Fleet exception operations',service:fleetService,ui:fleetOperations+'\n'+fleetExecution,authority:['fleet_exception_alerts','fleet_resolve_alert','fleet_route_exception_drilldown'],controls:['Resolve alert','Route exception']});
mutationSurface({label:'Fleet field execution',service:fleetService,ui:fleetExecution+'\n'+fleetDispatch,authority:['fleet_record_route_stop_timing','fleet_route_geofence_manifest'],controls:['LIVE GEOFENCE TRACKING','Mark arrived','Start service','Complete stop','Skip']});
mutationSurface({label:'Fleet monitoring and Live Network',service:fleetService+fleetSignals,ui:fleetSignals,authority:['fleet_list_monitored_locations','fleet_set_monitored_location','fleet_remove_monitored_location'],controls:['Live Network','Enable Live Network','Stop Live Network','Monitor location','Stop monitoring']});
mutationSurface({label:'Fleet metric configuration',service:fleetService+fleetMetrics,ui:fleetMetrics,authority:['get_fleet_metric_capabilities','create_fleet_metric_definition','update_fleet_metric_definition','assign_fleet_metric'],controls:['Create metric','Edit metric','Assign metric']});
requireAll('Fleet offline/sync UI',fleetSync,['Device offline queue','Replay queued field events']);
mutationSurface({label:'Fleet premium membership',service:fleetService,ui:fleetPremium,authority:['fleet_list_premium_members','fleet_grant_premium_member_by_email','fleet_revoke_premium_member'],controls:['Grant Fleet Premium','Revoke access']});
requireAll('Fleet Enterprise allocation authority',fleetEnterprise+fleetEnterpriseService,['createPartnerAllocation','Partner allocation','budget']);
requireAll('Fleet policy controls',fleetCapabilities,['Save dispatch policy','Save exception policy']);
for(const [name,source] of Object.entries({fleetAssets,fleetMaintenance,fleetPlanner,fleetDispatch,fleetOperations,fleetExecution,fleetSignals,fleetMetrics,fleetSync,fleetPremium,fleetEnterprise,fleetCapabilities}))noRawDump(name,source);

// BUSINESS — consolidated canonical screens are valid when they preserve the richer service/mutation behavior.
const businessProduct=requireFile('apps/business-mobile/services/product.ts');
const businessWorkflows=requireFile('apps/business-mobile/services/capabilityWorkflows.ts');
const businessQrService=requireFile('apps/business-mobile/services/qrStudio.ts');
const businessTrustService=requireFile('apps/business-mobile/services/trustOperations.ts');
const businessRemediationProof=requireFile('apps/business-mobile/services/remediationProof.ts');
const businessEnterpriseService=requireFile('apps/business-mobile/services/enterpriseEconomy.ts');
const businessLocations=requireFile('apps/business-mobile/app/locations.tsx');
const businessReviews=requireFile('apps/business-mobile/app/reviews.tsx');
const businessQr=requireFile('apps/business-mobile/app/qr-studio.tsx');
const businessNotifications=requireFile('apps/business-mobile/app/notifications.tsx');
const businessEngagement=requireFile('apps/business-mobile/app/engagement.tsx');
const businessPrevention=requireFile('apps/business-mobile/app/prevention.tsx');
const businessOperations=requireFile('apps/business-mobile/app/operations.tsx');
const businessGovernance=requireFile('apps/business-mobile/app/governance.tsx');
const businessEnterprise=requireFile('apps/business-mobile/app/enterprise.tsx');
const businessEnterpriseEconomy=requireFile('apps/business-mobile/components/EnterpriseEconomySection.tsx');
const businessLive=requireFile('apps/business-mobile/app/live-network.tsx');
const businessLiveService=requireFile('apps/business-mobile/services/liveNetwork.ts');
const businessService=businessProduct+'\n'+businessWorkflows+'\n'+businessQrService;
mutationSurface({label:'Business location management',service:businessService,ui:businessLocations,authority:['business_manage_location'],controls:['Find & claim an existing place','Edit','Deactivate','Create new location']});
mutationSurface({label:'Business review response',service:businessService,ui:businessReviews,authority:['business_reply_review'],controls:['Reply']});
mutationSurface({label:'Business QR lifecycle',service:businessService,ui:businessQr,authority:['business_create_custom_qr','business_update_custom_qr','business_set_qr_active','business_delete_qr','qr_studio_versions','qr_studio_restore_version','create_qr_engagement_program'],controls:['Create QR asset','Save configuration','Delete QR','Restore','Create engagement program','Share QR']});
requireAll('Business QR visual designer',businessQr,['FOREGROUND COLOR','BACKGROUND COLOR','MODULE STYLE','FINDER EYE STYLE','QUIET ZONE','Use business logo','Upload custom logo','LOGO SIZE','CTA LABEL','Scan readiness']);
requireAll('Business QR workflow configuration',businessQr,['ACTION TYPE','Single use','Max redemptions']);
requireAll('Business notification operations',businessNotifications,['Compose','Send notification','AUDIENCE','Kleenest AI','Enable device notifications']);
requireAll('Business engagement CRUD',businessEngagement,['Campaign','Promotion','Contest','Event','Create','Edit','Delete']);
requireAll('Business prevention execution',businessPrevention,['verification','Fleet handoff','Assign','Complete']);
mutationSurface({label:'Business trust operations',service:businessProduct+'\n'+businessTrustService+'\n'+businessRemediationProof,ui:businessOperations,authority:['business_manage_restroom_remediation','business_manage_reverification_case','business_create_reverification_qr','business_create_media'],controls:['Photo proof required','Resolve','Release','Create reverification QR']});
requireAll('Business governance controls',businessGovernance,['Create weekly report','Run due reports','Preview 30-day report','Schedules','Recent report runs']);
requireAll('Business Enterprise economy',businessEnterprise+'\n'+businessEnterpriseEconomy+businessEnterpriseService,['Enterprise economy','Create partner allocation','Budget cents','Activate newest allocation','Record campaign outcome','Load campaign ROI']);
requireAll('Business Live Network service authority',businessLiveService,['business_ensure_live_network_geofences','business_live_network_manifest','configure_business_geofence','record_geofence_event','register_notification_native_push_token']);
requireAny('Business Live Network controls',businessLive,[['Enable Live Network','Start Live Network'],['Disable Live Network','Disable on this device','Stop Live Network']]);
requireAll('Business Live Network operating surface',businessLive,['Canonical geofences','Register push again','Business motifs']);
for(const [name,source] of Object.entries({businessLocations,businessReviews,businessQr,businessNotifications,businessEngagement,businessPrevention,businessOperations,businessGovernance,businessEnterprise,businessEnterpriseEconomy,businessLive}))noRawDump(name,source);

// KLEENESTOS / OWNER — mutable platform domains must expose the actual command surface behind platform-owner authorization.
const ownerProduct=requireFile('apps/platform-mobile/services/product.ts');
const ownerAdmin=requireFile('apps/platform-mobile/services/ownerAdmin.ts');
const ownerEconomy=requireFile('apps/platform-mobile/services/ownerEconomy.ts');
const ownerDataService=requireFile('apps/platform-mobile/services/ownerData.ts');
const ownerAccess=requireFile('apps/platform-mobile/app/access.tsx');
const ownerBusinesses=requireFile('apps/platform-mobile/app/businesses.tsx');
const ownerProgression=requireFile('apps/platform-mobile/app/progression.tsx');
const ownerData=requireFile('apps/platform-mobile/app/data.tsx');
const ownerModeration=requireFile('apps/platform-mobile/app/moderation.tsx');
const ownerOperations=requireFile('apps/platform-mobile/app/operations.tsx');
const ownerCapabilities=requireFile('apps/platform-mobile/app/capabilities.tsx');
const ownerService=ownerProduct+'\n'+ownerAdmin+'\n'+ownerEconomy+'\n'+ownerDataService;
mutationSurface({label:'Owner people access',service:ownerService,ui:ownerAccess,authority:['admin_user_search','admin_set_user_access'],controls:['Search','Apply authoritative access']});
mutationSurface({label:'Owner business administration',service:ownerService,ui:ownerBusinesses,authority:['admin_business_search','admin_business_detail','admin_set_business_verification','admin_set_business_access','admin_assign_business_member','admin_remove_business_member'],controls:['Find a business','Verify','Reject','Fleet enabled','Enterprise enabled','Add member','Remove member']});
mutationSurface({label:'Owner progression economy',service:ownerService,ui:ownerProgression,authority:['owner_progression_xp_action_catalog','owner_update_progression_xp_action','owner_progression_objective_list','owner_progression_objective_upsert','owner_progression_objective_set_status','owner_progression_objective_delete','owner_progression_supply_status','owner_maintain_progression_supply'],controls:['Economy & Progression Studio','Create objective','Edit XP','Activate objective','Pause objective','Archive objective','Delete objective','Refresh progression supply']});
mutationSurface({label:'Owner data CRUD gateway',service:ownerService,ui:ownerData,authority:['admin_crud_capability_catalog','admin_crud_gateway'],controls:['Create record','Edit record','Delete record','PROTECTED']});
requireAll('Owner moderation decisions',ownerModeration,['Resolve','Dismiss','Mark reviewing']);
requireAll('Owner ingestion controls',ownerOperations,['Run one cycle','Repair stalled cells','Save storage guard','Save source policy']);
requireAll('Owner capability governance',ownerCapabilities,['Run live audit','Active canonical domain','Requires app surface','Open owning workflow']);
for(const [name,source] of Object.entries({ownerAccess,ownerBusinesses,ownerProgression,ownerData,ownerModeration,ownerOperations,ownerCapabilities}))noRawDump(name,source);

if(failures.length){console.error(`Operator functional parity audit failed with ${failures.length} gap(s):`);failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log('Operator functional parity audit passed: Business, Fleet and KleenestOS canonical mutable domains expose wired operating controls without obsolete duplicate-route requirements.');
