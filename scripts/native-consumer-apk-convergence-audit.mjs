import fs from 'node:fs';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const required=[
  'apps/consumer-mobile/app/preferences.tsx','apps/consumer-mobile/services/push.ts','apps/consumer-mobile/app/notifications.tsx','apps/consumer-mobile/app/_layout.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/app/qr.tsx','apps/consumer-mobile/app/location/[id].tsx','apps/consumer-mobile/services/contributionDraft.ts','apps/consumer-mobile/eas.json','apps/consumer-mobile/app.config.ts','.github/workflows/android-family.yml'
];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing APK convergence file: ${file}`);

if(!failures.length){
  const preferences=read(required[0]),push=read(required[1]),notifications=read(required[2]),layout=read(required[3]),route=read(required[4]),qr=read(required[5]),location=read(required[6]),contributionDraft=read(required[7]);
  const eas=JSON.parse(read(required[8])),config=read(required[9]),androidWorkflow=read(required[10]);
  const projectId='22a65aa3-c615-4c4f-a34d-084babc28fd7';
  if(!preferences.includes("profile_visibility:'public'|'followers'|'private'"))failures.push('Profile visibility must use canonical public/followers/private values.');
  if(!preferences.includes("value==='public'?'Community'"))failures.push('Public visibility must keep the consumer-facing Community label.');
  if(preferences.includes("profile_visibility:'community'"))failures.push('Legacy community visibility must not be sent as the canonical profile preference.');
  for(const token of ['kleenest.native.push.token.v1','SecureStore.getItemAsync(PUSH_TOKEN_KEY)','remove_notification_native_push_token','register_notification_native_push_token','permission.canAskAgain===false','permission-blocked','rotated:Boolean','SecureStore.setItemAsync(PUSH_TOKEN_KEY','SecureStore.deleteItemAsync(PUSH_TOKEN_KEY)'])if(!push.includes(token))failures.push(`Native push lifecycle missing ${token}`);
  for(const token of ['getNativePushStatus','registeredToken','pushBlocked','unregisterNativePush','Linking.openSettings','This device is registered for native push','this device token was removed'])if(!notifications.includes(token))failures.push(`Notification device recovery missing ${token}`);
  for(const token of ['clearLastNotificationResponseAsync','handledNotificationResponses','addNotificationResponseReceivedListener'])if(!layout.includes(token))failures.push(`Notification deep-link consumption missing ${token}`);
  for(const token of ['const [hydrated,setHydrated]','SecureStore.getItemAsync(DRAFT_KEY)','if(!hydrated)return','SecureStore.setItemAsync(DRAFT_KEY','Your saved stop order is still preserved','The local draft remains available'])if(!route.includes(token))failures.push(`Route durability missing ${token}`);
  for(const token of ['AppState.addEventListener','permission.canAskAgain===false','Linking.openSettings','scanLocked','The resolved code is still here so you can retry.'])if(!qr.includes(token))failures.push(`QR device lifecycle missing ${token}`);
  for(const token of ['findLatestEligibleReviewCheckIn','setCheckInId(eligible?.id||null)','readContributionDraft','writeContributionDraft','clearContributionDraft','draftHydrated','Restored your unfinished verified contribution draft.','Your unfinished contribution is still saved on this device.','Review saved, but amenity details could not be attached.','Review saved, but one or more photos could not be uploaded.'])if(!location.includes(token))failures.push(`Location contribution recovery missing ${token}`);
  for(const token of ['kleenest.native.contribution.draft.v1:','MAX_AGE_MS=48*60*60*1000','AsyncStorage.getItem','AsyncStorage.setItem','AsyncStorage.removeItem','reviewPhotos:(input.reviewPhotos||[]).slice(0,3)'])if(!contributionDraft.includes(token))failures.push(`Contribution draft durability missing ${token}`);
  if(eas?.build?.preview?.android?.buildType!=='apk'||eas?.build?.preview?.distribution!=='internal')failures.push('Preview EAS profile must remain an internal Android APK.');
  if(eas?.build?.production?.android?.buildType!=='app-bundle'||eas?.build?.production?.autoIncrement!==true)failures.push('Production EAS profile must remain an auto-incremented Android app bundle.');
  for(const token of ["package: 'com.kleenest.app'","bundleIdentifier: 'com.kleenest.app'","ACCESS_FINE_LOCATION","CAMERA","expo-notifications",projectId])if(!config.includes(token))failures.push(`Native app config missing ${token}`);

  // Consumer APK authority is the four-app family workflow. The audit verifies
  // the Consumer matrix identity plus binary and Android 16 startup gates rather
  // than requiring a second Consumer-only build workflow.
  for(const token of [
    'Build Kleenest App Family Android APKs',
    '- app: Consumer',
    'app_dir: apps/consumer-mobile',
    "workspace: '@kleenest/consumer-mobile'",
    'package_id: com.kleenest.app',
    `eas_project_id: ${projectId}`,
    'artifact: Kleenest-Consumer-Standalone-APK',
    'filename: Kleenest-Consumer.apk',
    'deeplink: kleenest://explore',
    "KLEENEST_STANDALONE_ANDROID: '1'",
    'app-family-critical-path-audit.mjs',
    "npm run typecheck --workspace '${{ matrix.workspace }}'",
    'npx expo prebuild --platform android --clean --no-install',
    'Build release APK',
    'Locate and verify release APK',
    'targetSdkVersion',
    'Android 16 startup smoke',
    'api-level: 36',
    'scripts/android-startup-smoke.sh',
    'Upload verified APK',
    'actions/upload-artifact@v4'
  ])if(!androidWorkflow.includes(token))failures.push(`Canonical Android family workflow missing Consumer release contract ${token}`);

  for(const forbidden of ['assembleDebug','app-debug.apk','Build Consumer Android Preview','.github/workflows/android-preview.yml'])if(androidWorkflow.includes(forbidden))failures.push(`Canonical Android family workflow must not use legacy/development artifact contract ${forbidden}`);
  if(androidWorkflow.includes('secrets.EAS_PROJECT_ID'))failures.push('Android family workflow must not depend on a secret for the public canonical EAS project id.');
  if(/service_role|record_data_feature_event/.test(preferences+push+notifications+layout+route+qr+location+contributionDraft))failures.push('APK consumer surfaces must not introduce privileged backend authority.');
}
if(failures.length){console.error('Native consumer APK convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log('Native Consumer APK convergence audit passed against the canonical four-app Android family workflow.');
