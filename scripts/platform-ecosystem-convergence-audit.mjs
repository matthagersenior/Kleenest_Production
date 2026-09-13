import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const requireTokens=(label,text,tokens)=>{for(const token of tokens)if(!text.includes(token))failures.push(label+' missing '+token);};

const migration=read('supabase/migrations/20260913133000_review_photo_moderation_fleet_operator_convergence.sql');
const photoService=read('apps/consumer-mobile/services/photoModeration.ts');
const photoActions=read('apps/consumer-mobile/components/PhotoTrustActions.tsx');
const reviewPhotos=read('apps/consumer-mobile/services/reviewPhotos.ts');
const reviewStrip=read('apps/consumer-mobile/components/ReviewPhotoStrip.tsx');
const consumerDetail=read('apps/consumer-mobile/app/location/[id].tsx');
const businessGrowth=read('apps/business-mobile/app/growth.tsx');
const ownerAdmin=read('apps/platform-mobile/services/ownerAdmin.ts');
const ownerModeration=read('apps/platform-mobile/app/moderation.tsx');
const businessAuth=read('apps/business-mobile/app/auth.tsx');
const fleetAuth=read('apps/fleet-mobile/app/auth.tsx');
const ownerAuth=read('apps/platform-mobile/app/auth.tsx');
const fleetLayout=read('apps/fleet-mobile/app/_layout.tsx');
const fleetPush=read('apps/fleet-mobile/services/push.ts');
const fleetNotifications=read('apps/fleet-mobile/web/notificationsPreview.ts');
const pushWorker=read('supabase/functions/deliver-push-notification/index.ts');
const businessHome=read('apps/business-mobile/app/index.tsx');
const businessFleet=read('apps/business-mobile/app/fleet.tsx');
const publisher=read('.github/workflows/publish-standalone-installer.yml');
const family=read('.github/workflows/android-family.yml');

requireTokens('Photo moderation migration',migration,[
 'review_photo_reports','review_photo_votes','moderation_status',
 "'privacy','explicit','relevance','other'",
 'queue_review_photo_report','review_photo_reported',"'platform_owner'",
 "'in_app'::text","'push'::text",
 'admin_list_review_photo_reports','admin_resolve_review_photo_report',
 'business_photo_dispute_owner_queue',
 "rp.moderation_status='visible'",
 'fleet_actor_is_manager','business_admin_guard'
]);
requireTokens('Consumer photo moderation service',photoService,['vote_review_photo','report_review_photo','privacy','explicit','relevance']);
requireTokens('Consumer photo controls',photoActions,['Helpful ·','Not helpful ·','Flag','immediate owner review']);
requireTokens('Review photo identity',reviewPhotos,['review_photo_id','helpful_votes','not_helpful_votes']);
requireTokens('Review photo strip controls',reviewStrip,['PhotoTrustActions','review_photo_id']);
requireTokens('Consumer location photo controls',consumerDetail,['PhotoTrustActions','immediate KleenestOS review']);
requireTokens('Business photo governance',businessGrowth,['Helpful ·','Not helpful ·','Flag / dispute','KleenestOS owner moderation']);
requireTokens('Owner photo queue service',ownerAdmin,['admin_list_review_photo_reports','resolveOwnerReviewPhotoReport','review-photos']);
requireTokens('Owner photo moderation UI',ownerModeration,['Photo flags','Photo reports','Hide photo','Restore photo','Mark reviewing']);

for(const [label,text,path] of [
 ['Business OAuth',businessAuth,'/Kleenest_Production/business/auth/'],
 ['Fleet OAuth',fleetAuth,'/Kleenest_Production/fleet/auth/'],
 ['Owner OAuth',ownerAuth,'/Kleenest_Production/owner/auth/']
]){
 requireTokens(label,text,[path,"Platform.OS==='web'"]);
}
requireTokens('Fleet operator tabs',fleetLayout,[
 "workspaceRole==='operator'",
 "name=\"notifications\" options={{title:'Alerts'}}",
 "name=\"account\" options={{title:'Account'}}"
]);
if(fleetLayout.includes("href:operator?null:undefined,title:'Alerts'"))failures.push('Fleet operator Alerts remain hidden.');
requireTokens('Fleet browser push',fleetPush,['PushManager','Notification','serviceWorker.register','register_notification_push_subscription','deliver-push-notification','registered-web']);
requireTokens('Fleet browser notification permission',fleetNotifications,['window.Notification.permission','window.Notification.requestPermission']);
requireTokens('Web push worker source authority',pushWorker,['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','req.method==="GET"','vapid_public_key','x-kleenest-worker-secret']);

requireTokens('Business Fleet entry',businessHome,["href:'/fleet'",'Fleet Suite','fleet_enabled']);
requireTokens('Business Fleet workspace',businessFleet,[
 'fleet_current_user_workspace_manifest','Fleet operator control plane','Fleet client/member experience',
 'operatorRoutes','kleenest-fleet://','/Kleenest_Production/fleet/'
]);
requireTokens('Pages Fleet/Business route publisher',publisher,[
 'business_routes=',' fleet analytics','apps/consumer-mobile/dist/business/fleet/index.html',
 'fleet_routes=','apps/consumer-mobile/dist/fleet/notifications/index.html'
]);
requireTokens('Family Android authority',family,[
 'Build Kleenest App Family Android APKs','group: kleenest-app-family-android-main',
 'cancel-in-progress: true','releases/family-native.txt','Android 16 startup smoke'
]);
if(family.includes('workflow_run:'))failures.push('Family native builds must not duplicate Production CI workflow_run delivery.');

if(failures.length){
 console.error('Kleenest platform ecosystem convergence audit failed:');
 for(const failure of failures)console.error('- '+failure);
 process.exit(1);
}
console.log('Kleenest platform ecosystem convergence audit passed: community photo trust moderation, owner escalation, Fleet Business/operator/member gates, web OAuth callbacks, Pages routes, and family-native authority converge on one canonical platform.');
