import fs from 'node:fs';

const failures=[];
const exists=(path)=>fs.existsSync(path);
const read=(path)=>(exists(path)?fs.readFileSync(path,'utf8'):'');
const json=(path)=>JSON.parse(read(path));
const must=(condition,message)=>{if(!condition)failures.push(message)};
const matrix=json('config/play-store-matrix.json');

must(matrix.schemaVersion>=2,'Play compliance matrix schema is stale');
must(matrix.targetSdk>=36,'Play targetSdk must be Android API 36 or newer');
must(matrix.productionFormat==='app-bundle','Google Play production format must be app-bundle');

for(const[key,app]of Object.entries(matrix.apps)){
  const root=app.workspace;
  const config=read(`${root}/app.config.ts`);
  const eas=json(`${root}/eas.json`);
  const production=eas.build?.production;

  must(config.includes(`package:'${app.package}'`)||config.includes(`package: '${app.package}'`),`${key}: Android package does not match compliance matrix`);
  must(eas.cli?.appVersionSource==='remote',`${key}: EAS appVersionSource must be remote`);
  must(production?.distribution==='store',`${key}: production EAS profile must use store distribution`);
  must(production?.autoIncrement===true,`${key}: production EAS profile must auto-increment version code`);
  must(production?.android?.buildType==='app-bundle',`${key}: production EAS profile must build an Android App Bundle`);
  must(Boolean(eas.submit?.production?.android),`${key}: production Android submit profile missing`);

  must(exists(`${root}/app/privacy.tsx`),`${key}: in-app privacy surface missing`);
  must(exists(`${root}/app/terms.tsx`),`${key}: in-app terms surface missing`);
  for(const legal of app.legal)must(exists(`public/legal/${legal}.html`),`${key}: public ${legal} document missing`);

  if(app.accountDeletion?.required||app.accountCreation){
    must(exists(`${root}/${app.accountDeletion.inAppRoute}`),`${key}: required in-app account deletion route missing`);
    must(exists(app.accountDeletion.publicPath),`${key}: required public account deletion document missing`);
  }else if(app.accountDeletion?.inAppRoute){
    must(exists(`${root}/${app.accountDeletion.inAppRoute}`),`${key}: account-control route missing`);
  }

  if(app.location.background){
    must(config.includes('ACCESS_BACKGROUND_LOCATION'),`${key}: background-location permission missing`);
    must(config.includes('isAndroidBackgroundLocationEnabled'),`${key}: Expo background-location plugin contract missing`);
    must(app.location.playDeclarationRequired===true,`${key}: Play background-location declaration must be tracked`);
    must(app.location.reviewVideoRequired===true,`${key}: Play background-location review video must be tracked`);
    must(app.location.prominentDisclosure===true,`${key}: prominent background-location disclosure must be tracked`);
    must(Boolean(app.location.purpose),`${key}: background-location purpose is undocumented`);
    const disclosure=read(`${root}/app/live-network.tsx`)+read(`${root}/app/signals.tsx`)+read(`${root}/app/dispatch.tsx`);
    must(/background location|background.*location|location.*background/i.test(disclosure),`${key}: prominent background-location purpose disclosure missing`);
    must(/Enable|Turn on|Start/i.test(disclosure),`${key}: background location must be user-initiated`);
    must(disclosure.includes('Alert.alert'),`${key}: prominent background-location disclosure dialog must appear before Android permission flow`);
    must(/closed|not in use/i.test(disclosure),`${key}: prominent disclosure must explain location use while the app is closed or not in use`);
    must(/Continue/.test(disclosure),`${key}: prominent disclosure needs an explicit continue action before the Android permission prompt`);
  }else{
    must(!config.includes("'ACCESS_BACKGROUND_LOCATION'"),`${key}: background location must not be requested`);
  }

  const appSource=exists(`${root}/app`)?fs.readdirSync(`${root}/app`).filter(file=>file.endsWith('.tsx')).map(file=>read(`${root}/app/${file}`)).join('\n'):'';
  must(!/https?:\/\/(stripe\.com|paypal\.com)|openURL\([^)]*(checkout|subscribe|purchase)/i.test(appSource),`${key}: external digital checkout detected`);
}

const consumerSource=
  read('apps/consumer-mobile/services/safety.ts')+
  read('apps/consumer-mobile/components/ReviewReportAction.tsx')+
  read('apps/consumer-mobile/app/blocked-users.tsx')+
  read('apps/consumer-mobile/components/PolicyAcceptanceGate.tsx');
for(const token of['report_user','report_review','block_user','unblock_user','accept_current_policies'])must(consumerSource.includes(token),`consumer: UGC safety contract missing ${token}`);

const ownerModeration=read('apps/platform-mobile/app/moderation.tsx')+read('apps/platform-mobile/services/ownerAdmin.ts');
for(const token of['admin_list_user_safety_reports','admin_list_ai_response_reports','admin_resolve_user_safety_report','admin_resolve_ai_response_report'])must(ownerModeration.includes(token),`owner: moderation contract missing ${token}`);

const familySignup=read('apps/consumer-mobile/app/signup.tsx');
must(/signup_intent\s*=\s*intent\s*===\s*['"]family['"]\s*\?\s*['"]family['"]\s*:\s*['"]individual['"]/.test(familySignup),'consumer: Family signup intent selection missing');
must(/data\s*:\s*\{\s*signup_intent\s*\}/.test(familySignup),'consumer: Family signup intent is not persisted into auth metadata');
must(!/set.*subscription_tier.*family|update\([^)]*subscription_tier/i.test(familySignup),'consumer: Family signup must not self-entitle outside Play/backend authority');
must(/does not charge|does not change your subscription tier/i.test(familySignup),'consumer: Family signup must disclose that intent selection is not a purchase or entitlement');

const businessAccess=read('apps/business-mobile/services/control.ts');
for(const token of['business_tier_capability_matrix','business_tier_qualification_snapshot','business_management_context','get_business_service_entitlement'])must(businessAccess.includes(token),`business: server-authoritative access contract missing ${token}`);
must(!/set.*subscription_tier|update.*subscription_tier/i.test(businessAccess),'business: mobile access layer must not directly mutate subscription tier');

if(failures.length){
  console.error('Play Store matrix audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Play Store matrix audit passed for all four Android packages.');
