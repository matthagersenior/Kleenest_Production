import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing converged app route: ${path}`);return read(path)};
const discover=(label,route,sources)=>must(sources.some(source=>source.includes(route)),`${label} exists but is not discoverable from its canonical app workflow: ${route}`);
const requireAll=(label,source,tokens)=>{for(const token of tokens)must(source.includes(token),`${label}: missing ${token}`)};

// Business standalone capability inventory -> Production Business app.
const businessIndex=requireFile('apps/business-mobile/app/index.tsx');
const businessLayout=requireFile('apps/business-mobile/app/_layout.tsx');
const businessQr=requireFile('apps/business-mobile/app/qr-studio.tsx');
const businessReviews=requireFile('apps/business-mobile/app/reviews.tsx');
const businessReviewEvidence=requireFile('apps/business-mobile/services/reviews.ts');
const businessEnterprise=requireFile('apps/business-mobile/app/enterprise.tsx');
const businessEnterpriseLocations=requireFile('apps/business-mobile/app/enterprise-locations.tsx');
const businessSources=[businessIndex,businessLayout];
const businessRoutes=[
 'assistant','auth','capabilities','engagement','enterprise-economy','enterprise-locations','enterprise','governance','intelligence','live-network','locations','members','notifications','prevention','profile','progression','qr-designer','qr-studio','reviews','trust-operations'
];
for(const route of businessRoutes)requireFile(`apps/business-mobile/app/${route}.tsx`);
for(const route of ['assistant','capabilities','engagement','enterprise-economy','enterprise-locations','enterprise','governance','intelligence','live-network','locations','members','notifications','prevention','profile','progression','qr-studio','reviews','trust-operations'])discover('Business',`/${route}`,businessSources);
discover('Business QR visual designer','/qr-designer',[businessIndex,businessQr,businessLayout]);
must(businessLayout.includes('name="engagement" options={{title:\'Growth\'}}'), 'Business Growth tab must resolve to the full engagement CRUD surface.');
requireAll('Business review evidence service',businessReviewEvidence,['mobile_review_evidence','mobile_location_review_evidence','mobile_review_photos_for_reviews','getReviewEvidence','getLocationReviewEvidence','getReviewPhotos']);
requireAll('Business review evidence UI',businessReviews,['Inspect review evidence','Review photos','Location evidence','Evidence source','Evidence confidence']);
must(!businessReviews.includes('JSON.stringify('),'Business reviews must render evidence as structured product UI, not raw JSON.');

// Standalone Enterprise is a four-mode operating system, not a networks summary. Preserve its portfolio, Fleet, network and intelligence jobs.
const enterpriseService=requireFile('apps/business-mobile/services/enterprise.ts');
const enterprisePortfolioService=requireFile('apps/business-mobile/services/enterprisePortfolio.ts');
requireAll('Business Enterprise service authority',enterpriseService,[
 'enterprise_control_plane_snapshot','enterprise_list_owned_networks','enterprise_list_partner_businesses','enterprise_list_network_members','enterprise_list_network_campaigns',
 'create_enterprise_partner_network','enterprise_update_network','enterprise_delete_network','invite_enterprise_partner','set_enterprise_partner_status',
 'create_enterprise_partner_campaign','enterprise_update_campaign','activate_enterprise_partner_campaign','pause_enterprise_partner_campaign','enterprise_delete_campaign',
 'record_enterprise_partner_campaign_outcome','get_partner_campaign_roi','get_partner_network_benchmark','get_partner_allocation_roi'
]);
requireAll('Business Enterprise operational portfolio authority',enterprisePortfolioService,['enterprise_operational_portfolio_snapshot']);
requireAll('Business Enterprise operating modes',businessEnterprise,['Overview','Operations','Network','Intelligence']);
requireAll('Business Enterprise portfolio operations',businessEnterprise,['Portfolio businesses','Portfolio readiness','Fleet command','Operational alerts','Location network']);
requireAll('Business Enterprise network operations',businessEnterprise,['Create partner network','Invite partner business','Campaign ROI','Record partner outcome']);
requireAll('Business Enterprise intelligence',businessEnterprise,['Allocation ROI','Enterprise analytics','Open Economy']);
requireAll('Business Enterprise Location portfolio',businessEnterpriseLocations,['Managed locations','Location intelligence','Active QR assets','Remaining Growth slots']);
requireAll('Business Enterprise Location actions',businessEnterpriseLocations,['Manage location','QR Studio','Reviews','Advanced Intelligence','Campaign engagement','Trust operations','Preventive operations','Notify customers/team']);
requireAll('Business Enterprise Location metrics',businessEnterpriseLocations,['30-day searches','30-day location views','30-day check-ins','30-day reviews']);

// Fleet standalone capability inventory -> Production Fleet app. Standalone dispatch is split into Planner + Dispatch in Production.
const fleetIndex=requireFile('apps/fleet-mobile/app/index.tsx');
const fleetLayout=requireFile('apps/fleet-mobile/app/_layout.tsx');
const fleetPlanner=requireFile('apps/fleet-mobile/app/planner.tsx');
const fleetDispatch=requireFile('apps/fleet-mobile/app/dispatch.tsx');
const fleetMap=requireFile('apps/fleet-mobile/components/FleetMap.tsx');
const fleetGeofence=requireFile('apps/fleet-mobile/services/geofence.ts');
const fleetEnterpriseService=requireFile('apps/fleet-mobile/services/enterprise.ts');
const fleetRoutes=['auth','capabilities','dispatch','enterprise','execution','index','insights','metrics','operations','premium','progression','signals','sync'];
for(const route of fleetRoutes)requireFile(`apps/fleet-mobile/app/${route}.tsx`);
for(const route of ['capabilities','dispatch','enterprise','execution','insights','metrics','operations','premium','progression','signals','sync'])discover('Fleet',`/${route}`,[fleetIndex,fleetLayout]);
must(fleetIndex.includes('Intelligence')&&fleetIndex.includes('/insights'),'Fleet standalone Intelligence capability must remain exposed as the Production Insights workflow.');
requireAll('Fleet map planner',fleetPlanner,['FleetMap','Save stop order','MAP ROUTING + DISPATCH','Search','5 mi','10 mi','25 mi','50 mi','100 mi','National','Assign vehicle','Assign driver','moveStop','Remove']);
requireAll('Fleet dispatch execution',fleetDispatch,['Dispatch','Pause','Resume','Mark arrived','Start service','Complete stop','Depart stop','Skip']);
requireAll('Fleet map interaction',fleetMap,['business_logo_url','routeStopIds','onInteractionChange','Recenter Fleet map']);
requireAll('Fleet Live Network authority',fleetGeofence,['fleet_route_geofence_manifest','record_geofence_event','startGeofencingAsync','register_notification_native_push_token']);
requireAll('Fleet Enterprise authority',fleetEnterpriseService,['getEnterpriseOperationalPortfolio','createEnterpriseNetwork','inviteEnterprisePartner','createPartnerAllocation','getPartnerNetworkBenchmark','getPartnerAllocationRoi']);

// Owner/KleenestOS standalone capability inventory -> Production platform app. Standalone reports are folded into the richer moderation command center.
const ownerIndex=requireFile('apps/platform-mobile/app/index.tsx');
const ownerLayout=requireFile('apps/platform-mobile/app/_layout.tsx');
const ownerModeration=requireFile('apps/platform-mobile/app/moderation.tsx');
const ownerAccess=requireFile('apps/platform-mobile/app/access.tsx');
const ownerBusinesses=requireFile('apps/platform-mobile/app/businesses.tsx');
const ownerProgression=requireFile('apps/platform-mobile/app/progression.tsx');
const ownerOperations=requireFile('apps/platform-mobile/app/operations.tsx');
const ownerAdmin=requireFile('apps/platform-mobile/services/ownerAdmin.ts');
const ownerEconomy=requireFile('apps/platform-mobile/services/ownerEconomy.ts');
const ownerControl=requireFile('apps/platform-mobile/services/controlPlane.ts');
const ownerRoutes=['access','audit','auth','businesses','capabilities','data','index','intelligence','moderation','operations','progression','reports'];
for(const route of ownerRoutes)requireFile(`apps/platform-mobile/app/${route}.tsx`);
for(const route of ['access','audit','businesses','capabilities','data','intelligence','moderation','operations','progression'])discover('KleenestOS',`/${route}`,[ownerIndex,ownerLayout]);
must(ownerModeration.includes('Review reports')&&ownerModeration.includes('User safety reports')&&ownerModeration.includes('AI response reports'),'KleenestOS moderation must subsume the standalone Reports surface without losing report queues.');
requireAll('KleenestOS authorization',ownerAdmin,['admin_authorization_v1','getOwnerAuthorization','requirePlatformOwner','admin_user_search','admin_set_user_access']);
requireAll('KleenestOS economy authority',ownerEconomy,['owner_progression_platform_snapshot','owner_progression_xp_action_catalog','owner_update_progression_xp_action','owner_progression_objective_list','owner_progression_objective_upsert','owner_progression_objective_set_status','owner_progression_objective_delete','owner_progression_supply_status']);
requireAll('KleenestOS operations authority',ownerControl,['owner_ingestion_control_snapshot','admin_set_national_ingestion_resume_authorization']);
requireAll('KleenestOS access UI',ownerAccess,['Search','subscription','admin','Audit reason']);
requireAll('KleenestOS business UI',ownerBusinesses,['Fleet enabled','Enterprise enabled','Add member','Remove member']);
requireAll('KleenestOS economy UI',ownerProgression,['Economy & Progression Studio','Evidence tiers','Level distribution','Objective mix','Progression supply','Create objective','Archive objective','Delete objective']);
requireAll('KleenestOS operations UI',ownerOperations,['National ingestion control','Run one cycle','Repair stalled cells','Authorize resume','Storage guard','Source policies & quotas','Priority & coverage queue']);
requireAll('KleenestOS command center',ownerIndex,['Needs attention','ECONOMY PULSE','Open Economy','Database','Disk observed','Native push','Integrity','Subsystem degraded','No active owner actions']);

if(failures.length){
 console.error(`Standalone app convergence audit failed with ${failures.length} gap(s):`);
 failures.forEach(failure=>console.error(`- ${failure}`));
 process.exit(1);
}
console.log('Standalone app convergence audit passed: Business, Fleet and KleenestOS source capabilities are present and reachable in the Production apps.');
