import fs from 'node:fs';
const contract=JSON.parse(fs.readFileSync('config/product-parity.json','utf8'));
const failures=[];
const exists=path=>fs.existsSync(path);
const read=path=>exists(path)?fs.readFileSync(path,'utf8'):'';
const operatorCommon=[['app/account.tsx','signInWithPassword'],['app/account.tsx','request_account_deletion'],['app/account.tsx','showPassword'],['app/notifications.tsx','registerRolePush'],['services/push.ts','register_notification_native_push_token'],['services/push.ts','getExpoPushTokenAsync']];
const evidence={
 consumer:{
  routes:['explore.tsx','location/[id].tsx','qr.tsx','saved.tsx','route.tsx','offline.tsx','social.tsx','messages.tsx','notifications.tsx','play.tsx','games.tsx','family.tsx','membership.tsx','support.tsx','privacy.tsx','account-deletion.tsx','safety.tsx'],
  markers:[['services/safety.ts','report_user'],['services/safety.ts','block_user'],['services/safety.ts','report_review'],['app/location/[id].tsx','mobileCheckIn'],['app/location/[id].tsx','createMobileReview'],['app/explore.tsx','listNearbyRestrooms']]
 },
 business:{
  routes:['locations.tsx','growth.tsx','operations.tsx','analytics.tsx','enterprise.tsx','enterprise-locations.tsx','profile.tsx','team.tsx','members.tsx','assistant.tsx','intelligence.tsx','live-network.tsx','progression.tsx','capabilities.tsx','workspaces.tsx','qr-studio.tsx','reviews.tsx','partners.tsx','notifications.tsx','support.tsx','terms.tsx','privacy.tsx','account.tsx'],
  markers:[
   ['services/product.ts','business_list_workspaces'],['services/product.ts','business_manage_location'],['services/product.ts','business_reply_review'],['services/product.ts','business_manage_promotion'],['services/product.ts','business_manage_campaign'],['services/product.ts','business_manage_contest'],['services/product.ts','business_manage_event'],['services/product.ts','business_manage_qr'],['services/product.ts','business_create_custom_qr'],['services/product.ts','business_list_media'],['services/product.ts','business_update_media'],['services/product.ts','business_restroom_remediation_operations'],['services/product.ts','business_manage_restroom_remediation'],['services/product.ts','business_reverification_queue'],['services/product.ts','business_manage_reverification_case'],['services/product.ts','business_restroom_preventive_work_orders'],['services/product.ts','business_manage_restroom_preventive_work_order'],['services/product.ts','enterprise_control_plane_snapshot'],['services/product.ts','enterprise_list_owned_networks'],['services/product.ts','enterprise_list_partner_businesses'],
   ['services/capabilityWorkflows.ts','kleenest.business.selected_workspace.v1'],['services/capabilityWorkflows.ts','currentBusinessId'],['services/capabilityWorkflows.ts','business_live_network_manifest'],['services/capabilityWorkflows.ts','business_progression_engagement_snapshot'],['services/capabilityWorkflows.ts','business_invite_member'],['services/capabilityWorkflows.ts','business_transfer_ownership'],
   ['services/ai.ts','ai-assist'],...operatorCommon
  ]
 },
 fleet:{
  routes:['planner.tsx','dispatch.tsx','assets.tsx','maintenance.tsx','insights.tsx','operations.tsx','premium.tsx','progression.tsx','capabilities.tsx','workspaces.tsx','enterprise.tsx','notifications.tsx','support.tsx','terms.tsx','privacy.tsx','account.tsx'],
  markers:[
   ['services/product.ts','fleet_current_user_dispatch'],['services/product.ts','fleet_create_route'],['services/product.ts','fleet_dispatch_route'],['services/product.ts','fleet_create_vehicle'],['services/product.ts','fleet_create_driver'],['services/product.ts','fleet_create_maintenance'],['services/product.ts','fleet_resolve_alert'],['services/product.ts','fleet_operational_signal_summary'],['services/product.ts','fleet_operations_exception_intelligence'],['services/product.ts','fleet_restroom_remediation_risk'],['services/product.ts','fleet_restroom_prevention_portfolio'],['services/product.ts','fleet_restroom_preventive_schedule'],['services/product.ts','fleet_restroom_prevention_effectiveness'],['services/product.ts','fleet_preventive_dispatch_opportunities'],
   ['services/control.ts','kleenest.fleet.selected_workspace.v1'],['services/control.ts','fleet_list_premium_members'],['services/control.ts','fleet_progression_snapshot'],['services/control.ts','fleet_set_monitored_location'],['services/control.ts','fleet_attach_preventive_work_to_route'],['services/control.ts','fleet_set_route_stops'],
   ['services/locations.ts','map_network_nearby_v2'],['services/enterprise.ts','enterprise_list_owned_networks'],['services/enterprise.ts','create_enterprise_partner_network'],['services/enterprise.ts','get_partner_campaign_roi'],
   ['services/offline.ts','fleet_replay_route_stop_timing'],['services/offline.ts','AsyncStorage'],...operatorCommon
  ]
 },
 platform:{
  routes:['businesses.tsx','moderation.tsx','access.tsx','operations.tsx','accounts.tsx','history.tsx','intelligence.tsx','reports.tsx','progression.tsx','capabilities.tsx','audit.tsx','data.tsx','notifications.tsx','support.tsx','terms.tsx','privacy.tsx','account.tsx'],
  markers:[
   ['services/product.ts','admin_list_pending_businesses'],['services/product.ts','admin_set_business_verification'],['services/product.ts','admin_set_business_tier'],['services/product.ts','admin_set_business_access'],['services/product.ts','admin_set_account_capabilities'],['services/product.ts','admin_assign_business_member'],['services/product.ts','admin_remove_business_member'],['services/product.ts','admin_list_review_reports'],['services/product.ts','admin_resolve_review_report'],['services/product.ts','admin_list_activity_events'],['services/product.ts','admin_control_plane_history'],
   ['services/ownerAdmin.ts','admin_authorization_v1'],['services/ownerAdmin.ts','admin_user_search'],['services/ownerAdmin.ts','admin_set_user_access'],['services/ownerAdmin.ts','admin_list_user_safety_reports'],['services/ownerAdmin.ts','admin_list_ai_response_reports'],['services/ownerAdmin.ts','owner_progression_platform_snapshot'],['services/ownerAdmin.ts','admin_operational_capability_catalog'],['services/ownerAdmin.ts','run_capability_audit'],['services/ownerAdmin.ts','admin_crud_gateway'],...operatorCommon
  ]
 }
};
const noRawJson={
 business:['app/index.tsx','app/analytics.tsx','app/growth.tsx','app/enterprise.tsx'],
 fleet:['app/index.tsx','app/insights.tsx'],
 platform:['app/index.tsx','app/data.tsx']
};
for(const[role,app]of Object.entries(contract.apps)){
 const root=app.workspace;
 if(!exists(root)){failures.push(`${role}: missing native workspace ${root}`);continue;}
 for(const file of['package.json','app.config.ts','eas.json','tsconfig.json','app/_layout.tsx','app/index.tsx'])if(!exists(`${root}/${file}`))failures.push(`${role}: missing ${file}`);
 const config=read(`${root}/app.config.ts`);
 if(!config.includes(app.androidPackage))failures.push(`${role}: Android package must be ${app.androidPackage}`);
 if(!config.includes("version:'1.0.0'")&&!config.includes("version: '1.0.0'"))failures.push(`${role}: app-facing version must be 1.0.0`);
 const eas=exists(`${root}/eas.json`)?JSON.parse(read(`${root}/eas.json`)):{};
 if(eas?.build?.candidate?.android?.buildType!=='apk'||eas?.build?.candidate?.distribution!=='internal')failures.push(`${role}: candidate profile must be an internal APK`);
 if(eas?.build?.production?.android?.buildType!=='app-bundle'||eas?.build?.production?.distribution!=='store')failures.push(`${role}: production profile must be a store AAB`);
 const ev=evidence[role];
 if(!ev){failures.push(`${role}: no parity evidence contract`);continue;}
 for(const route of ev.routes)if(!exists(`${root}/app/${route}`))failures.push(`${role}: missing native route ${route}`);
 for(const[file,marker]of ev.markers){const path=`${root}/${file}`;if(!exists(path)||!read(path).includes(marker))failures.push(`${role}: missing authority evidence ${marker} in ${file}`);}
 for(const file of noRawJson[role]||[]){const path=`${root}/${file}`;if(read(path).includes('JSON.stringify('))failures.push(`${role}: ${file} must present operational UI instead of raw JSON.stringify output`);}
 if(role!=='consumer'){const pkg=JSON.parse(read(`${root}/package.json`));if(!pkg.dependencies?.['expo-notifications']||!pkg.dependencies?.['expo-constants'])failures.push(`${role}: native push dependencies missing`);if(!config.includes('expo-notifications'))failures.push(`${role}: native push plugin missing`);}
}
if(failures.length){console.error('Product parity audit failed:');failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}
console.log(`Product parity audit passed for ${Object.keys(contract.apps).length} app products with full convergence route, auth, push, operational UX and authority evidence.`);
