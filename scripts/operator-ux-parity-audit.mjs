import fs from 'node:fs';

const failures=[];
const exists=(path)=>fs.existsSync(path);
const read=(path)=>exists(path)?fs.readFileSync(path,'utf8'):'';
const must=(condition,message)=>{if(!condition)failures.push(message)};

const operatorApps=['apps/business-mobile','apps/fleet-mobile','apps/platform-mobile'];
for(const root of operatorApps){
  const appDir=`${root}/app`;
  if(!exists(appDir)){failures.push(`${root}: missing app directory`);continue;}
  for(const file of fs.readdirSync(appDir).filter(name=>name.endsWith('.tsx'))){
    const source=read(`${appDir}/${file}`);
    must(!source.includes('JSON.stringify('),`${root}/app/${file}: raw JSON presentation is forbidden`);
    must(!source.includes('style={s.json}'),`${root}/app/${file}: JSON dump styling is forbidden`);
    must(!source.includes('selectable style={s.json}'),`${root}/app/${file}: selectable payload dump is forbidden`);
  }
}

const businessHome=read('apps/business-mobile/app/index.tsx');
const businessGrowth=read('apps/business-mobile/app/growth.tsx');
const businessService=read('apps/business-mobile/services/product.ts');
for(const token of ['STANDARD','GROWTH','location limit','Growth'])must((businessHome+businessGrowth).includes(token),`Business Standard/Growth UX missing ${token}`);
for(const token of ['get_business_product_access','get_business_service_entitlement'])must(businessService.includes(token),`Business tier authority missing ${token}`);

const consumerSignup=read('apps/consumer-mobile/app/signup.tsx');
for(const token of ['Individual','Family','signup_intent','family','signUp'])must(consumerSignup.includes(token),`Consumer signup must expose Family intent: missing ${token}`);

const fleetRequired=['operations.tsx','execution.tsx','signals.tsx','metrics.tsx','premium.tsx','enterprise.tsx','capabilities.tsx','sync.tsx'];
for(const route of fleetRequired)must(exists(`apps/fleet-mobile/app/${route}`),`Fleet workflow route missing ${route}`);
const fleetService=read('apps/fleet-mobile/services/product.ts')+read('apps/fleet-mobile/services/parity.ts')+read('apps/fleet-mobile/services/signals.ts');
for(const token of ['get_fleet_metric_capabilities','create_fleet_metric_definition','assign_fleet_metric','fleet_grant_premium_member_by_email','fleet_revoke_premium_member','fleet_attach_preventive_work_to_route','fleet_list_monitored_locations','get_fleet_leaderboard','get_fleet_network_leaderboard'])must(fleetService.includes(token),`Fleet authority coverage missing ${token}`);

const ownerRequired=['access.tsx','audit.tsx','capabilities.tsx','data.tsx','operations.tsx','progression.tsx','moderation.tsx','intelligence.tsx','businesses.tsx'];
for(const route of ownerRequired)must(exists(`apps/platform-mobile/app/${route}`),`KleenestOS workflow route missing ${route}`);
const ownerService=read('apps/platform-mobile/services/product.ts');
for(const token of ['admin_authorization_v1','admin_user_search','admin_set_user_access','admin_backend_resource_catalog','run_capability_audit','admin_raw_schema_capability_audit','owner_progression_platform_snapshot','owner_progression_objective_list','admin_national_ingestion_status','repair_stalled_national_ingestion_cells','admin_list_user_safety_reports','admin_list_ai_response_reports'])must(ownerService.includes(token),`KleenestOS authority coverage missing ${token}`);

if(failures.length){console.error('Operator UX parity audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Operator UX parity audit passed: task workflows, tier/family onboarding and no raw JSON operator presentation.');
