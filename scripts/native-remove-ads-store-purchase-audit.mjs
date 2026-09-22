import fs from 'node:fs';
const read=file=>fs.readFileSync(file,'utf8');
const failures=[];
const required=[
  'apps/consumer-mobile/package.json',
  'apps/consumer-mobile/app.config.ts',
  'apps/consumer-mobile/app/membership.tsx',
  'apps/consumer-mobile/components/StorePurchaseControls.native.tsx',
  'apps/consumer-mobile/components/StorePurchaseControls.tsx',
  'apps/consumer-mobile/services/storePurchases.ts',
  'supabase/functions/verify-mobile-store-purchase/index.ts',
  fs.readdirSync('supabase/migrations').find(name=>name.includes('native_remove_ads_store_entitlement')&&name.endsWith('.sql')) ? `supabase/migrations/${fs.readdirSync('supabase/migrations').find(name=>name.includes('native_remove_ads_store_entitlement')&&name.endsWith('.sql'))}` : 'supabase/migrations/__missing_native_remove_ads_store_entitlement__.sql',
  'docs/NATIVE_REMOVE_ADS_STORE_BILLING.md',
];
for(const file of required)if(!fs.existsSync(file))failures.push(`Missing Remove Ads store surface: ${file}`);
if(!failures.length){
  const pkg=read(required[0]),config=read(required[1]),membership=read(required[2]),controls=read(required[3]),service=read(required[5]),edge=read(required[6]),sql=read(required[7]),docs=read(required[8]);
  if(!pkg.includes('"expo-iap": "5.6.3"'))failures.push('Consumer must pin the vetted Expo IAP bridge.');
  if(!config.includes("'expo-iap'"))failures.push('Consumer Expo config must run the expo-iap config plugin.');
  for(const token of ['StorePurchaseControls','Google/network ads','Kleenest Sponsored'])if(!membership.includes(token))failures.push(`Membership missing store disclosure: ${token}`);
  for(const token of ['useIAP','Buy for $5','Restore purchase','requestPurchase','Google/network ads','Kleenest Sponsored'])if(!controls.includes(token))failures.push(`Native purchase control missing: ${token}`);
  for(const token of ['kleenest_remove_ads_lifetime','getAvailablePurchases','finishTransaction',"functions.invoke('verify-mobile-store-purchase'"])if(!service.includes(token))failures.push(`Store purchase service missing: ${token}`);
  for(const token of ['androidpublisher.googleapis.com','api.storekit.itunes.apple.com','api.storekit-sandbox.itunes.apple.com','KLEENEST_IAP_CREDENTIALS_JSON','grant_mobile_store_premium','appAccountToken','obfuscatedExternalAccountId'])if(!edge.includes(token))failures.push(`Store verifier missing: ${token}`);
  for(const token of ['mobile_store_purchases','grant_mobile_store_premium',"'mobile_store_purchase'","enable row level security"])if(!sql.toLowerCase().includes(token.toLowerCase()))failures.push(`Store entitlement migration missing: ${token}`);
  for(const token of ['Google Play','Apple App Store','network ads only','Kleenest Sponsored'])if(!docs.includes(token))failures.push(`Store billing documentation missing: ${token}`);
}
if(failures.length){console.error('Native Remove Ads store purchase audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native Remove Ads store purchase audit passed.');
