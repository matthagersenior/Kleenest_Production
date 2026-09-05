import fs from 'node:fs';

const failures=[];
const exists=(path)=>fs.existsSync(path);
const read=(path)=>exists(path)?fs.readFileSync(path,'utf8'):'';
const json=(path)=>JSON.parse(read(path));
const must=(condition,message)=>{if(!condition)failures.push(message)};
const matrix=json('config/play-store-matrix.json');

must(matrix.targetSdk>=36,'Play targetSdk must be Android API 36 or newer');
for(const [key,app] of Object.entries(matrix.apps)){
  const root=app.workspace;
  const config=read(`${root}/app.config.ts`);
  must(config.includes(`package:'${app.package}'`)||config.includes(`package: '${app.package}'`),`${key}: Android package does not match compliance matrix`);
  must(exists(`${root}/${app.accountDeletion.inAppRoute}`),`${key}: account-control route missing`);
  must(exists(app.accountDeletion.publicPath),`${key}: public account deletion document missing`);
  must(exists(`${root}/app/privacy.tsx`),`${key}: in-app privacy surface missing`);
  must(exists(`${root}/app/terms.tsx`),`${key}: in-app terms surface missing`);
  for(const legal of app.legal){must(exists(`public/legal/${legal}.html`),`${key}: public ${legal} document missing`)}
  if(app.location.background){
    must(config.includes('ACCESS_BACKGROUND_LOCATION'),`${key}: background-location permission missing`);
    must(config.includes('isAndroidBackgroundLocationEnabled'),`${key}: Expo background-location plugin contract missing`);
    const disclosure=read(`${root}/app/live-network.tsx`)+read(`${root}/app/signals.tsx`)+read(`${root}/app/dispatch.tsx`);
    must(/background location|background.*location|location.*background/i.test(disclosure),`${key}: prominent background-location purpose disclosure missing`);
    must(/Enable|Turn on|Start/i.test(disclosure),`${key}: background location must be user-initiated`);
  }else{
    must(!config.includes('ACCESS_BACKGROUND_LOCATION'),`${key}: background location must not be requested`);
  }
  const appSource=exists(`${root}/app`)?fs.readdirSync(`${root}/app`).filter(f=>f.endsWith('.tsx')).map(f=>read(`${root}/app/${f}`)).join('\n'):'';
  must(!/https?:\/\/(stripe\.com|paypal\.com)|openURL\([^)]*(checkout|subscribe|purchase)/i.test(appSource),`${key}: external digital checkout detected`);
}

const consumerSource=read('apps/consumer-mobile/services/safety.ts')+read('apps/consumer-mobile/components/ReviewReportAction.tsx')+read('apps/consumer-mobile/app/blocked-users.tsx')+read('apps/consumer-mobile/components/PolicyAcceptanceGate.tsx');
for(const token of ['report_user','report_review','block_user','unblock_user','accept_current_policies'])must(consumerSource.includes(token),`consumer: UGC safety contract missing ${token}`);

const ownerModeration=read('apps/platform-mobile/app/moderation.tsx')+read('apps/platform-mobile/services/product.ts');
for(const token of ['admin_list_user_safety_reports','admin_list_ai_response_reports'])must(ownerModeration.includes(token),`owner: moderation contract missing ${token}`);

const familySignup=read('apps/consumer-mobile/app/signup.tsx');
must(familySignup.includes("signup_intent:'family'")||familySignup.includes("signup_intent: 'family'"),'consumer: Family signup intent missing');
must(!/set.*subscription_tier.*family|update\([^)]*subscription_tier/i.test(familySignup),'consumer: Family signup must not self-entitle outside Play/backend authority');

const businessProduct=read('apps/business-mobile/services/product.ts');
for(const token of ['get_business_product_access','get_business_service_entitlement'])must(businessProduct.includes(token),`business: server-authoritative Standard/Growth entitlement contract missing ${token}`);

if(failures.length){console.error('Play Store matrix audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Play Store matrix audit passed for all four Android packages.');
