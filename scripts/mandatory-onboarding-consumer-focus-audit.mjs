import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=file=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):'';
const failures=[];

const required=[
  'supabase/migrations/20260911021000_mandatory_targeted_business_onboarding.sql',
  'apps/business-mobile/app/_layout.tsx',
  'apps/business-mobile/app/onboarding.tsx',
  'apps/business-mobile/app/index.tsx',
  'apps/business-mobile/services/onboarding.ts',
  'apps/fleet-mobile/app/_layout.tsx',
  'apps/fleet-mobile/app/onboarding.tsx',
  'apps/fleet-mobile/services/onboarding.ts',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'apps/consumer-mobile/app/index.tsx'
];
for(const file of required) if(!fs.existsSync(path.join(root,file))) failures.push('missing '+file);

const migration=read('supabase/migrations/20260911021000_mandatory_targeted_business_onboarding.sql');
for(const token of [
  'business_onboarding_gate',
  'onboarding_version',
  'answers jsonb',
  'experience jsonb',
  'required_after',
  'targeted_routes',
  'mandatory'
]) if(!migration.includes(token)) failures.push('onboarding migration missing '+token);

const service=read('apps/business-mobile/services/onboarding.ts');
for(const token of ['getBusinessOnboardingGate','business_onboarding_gate','answers','experience']) if(!service.includes(token)) failures.push('onboarding service missing '+token);

const layout=read('apps/business-mobile/app/_layout.tsx');
for(const token of ['getBusinessOnboardingGate','/onboarding','onboardingRequired']) if(!layout.includes(token)) failures.push('Business layout missing mandatory gate token '+token);

const onboarding=read('apps/business-mobile/app/onboarding.tsx');
const fleetLayout=read('apps/fleet-mobile/app/_layout.tsx');
const fleetOnboarding=read('apps/fleet-mobile/app/onboarding.tsx');
const fleetHome=read('apps/fleet-mobile/app/index.tsx');
const fleetService=read('apps/fleet-mobile/services/onboarding.ts');
for(const token of [
  'customer_profile','access_model','traffic_pattern','pain_points','qr_intent',
  'success_metrics','reporting_cadence','team_focus','Complete business setup'
]) if(!onboarding.includes(token)) failures.push('detailed onboarding UI missing '+token);
for(const token of ['getFleetOnboardingGate','business_onboarding_gate','business_onboarding_apply_v2']) if(!fleetService.includes(token)) failures.push('Fleet onboarding service missing '+token);
for(const token of ['getFleetOnboardingGate','onboardingRequired','/onboarding']) if(!fleetLayout.includes(token)) failures.push('Fleet mandatory gate missing '+token);
for(const token of ['customer_profile','access_model','traffic_pattern','pain_points','qr_intent','success_metrics','reporting_cadence','team_focus','Complete Fleet setup']) if(!fleetOnboarding.includes(token)) failures.push('Fleet detailed onboarding missing '+token);
for(const token of ['getFleetOnboardingState','YOUR PRIORITIES','Targeted from onboarding']) if(!fleetHome.includes(token)) failures.push('Fleet targeted home missing '+token);

const businessHome=read('apps/business-mobile/app/index.tsx');
for(const token of ['getBusinessOnboardingState','YOUR PRIORITIES','targeted_routes']) if(!businessHome.includes(token)) failures.push('targeted Business home missing '+token);

const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
for(const token of ['Location.geocodeAsync','looksLikeAddressOrArea','searchAreaOrigin','Searching near','searched-area-marker']) if(!explore.includes(token)) failures.push('Explore address-origin search missing '+token);

const consumerHome=read('apps/consumer-mobile/app/index.tsx');
for(const token of ['FIND A BATHROOM','CHECK IN / REVIEW','SCAN QR','homePrimaryCta']) if(!consumerHome.includes(token)) failures.push('Consumer Home focal hierarchy missing '+token);

if(failures.length){
  console.error('Mandatory onboarding / Consumer focus gate failed:');
  for(const failure of failures) console.error('- '+failure);
  process.exit(1);
}
console.log('Mandatory onboarding / Consumer focus gate passed.');
