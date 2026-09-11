import fs from 'node:fs';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const requireFile=p=>{if(!fs.existsSync(p))failures.push('missing '+p)};
const requireTokens=(path,tokens)=>{const source=read(path);for(const token of tokens)if(!source.includes(token))failures.push(path+' missing '+token)};

const migration='supabase/migrations/20260911080500_business_fleet_onboarding_portfolio_home.sql';
requireFile(migration);
requireTokens(migration,[
  'business_managed_location_portfolio',
  'business_onboarding_save_draft_v2',
  "'scope','direct'",
  "'scope','network'",
  "'portfolio_location_count'",
  "'direct_location_count'",
  "'partner_business_count'"
]);

requireTokens('apps/business-mobile/services/onboarding.ts',["business_onboarding_save_draft_v2"]);
requireTokens('apps/fleet-mobile/services/onboarding.ts',["business_onboarding_save_draft_v2"]);
requireTokens('apps/business-mobile/services/product.ts',["getBusinessManagedLocationPortfolio","business_managed_location_portfolio"]);
requireTokens('apps/business-mobile/app/index.tsx',[
  'getBusinessManagedLocationPortfolio',
  'getBusinessOnboardingGate',
  'ONBOARDING COMPLETE',
  'ONBOARDING IN PROGRESS',
  'Portfolio locations',
  'ActionTile',
  'heroStats'
]);
requireTokens('apps/business-mobile/app/enterprise-locations.tsx',[
  'getBusinessManagedLocationPortfolio',
  'portfolio?.locations',
  'NETWORK PORTFOLIO'
]);
requireTokens('apps/business-mobile/app/locations.tsx',[
  'getBusinessManagedLocationPortfolio',
  'Enterprise portfolio',
  'NETWORK'
]);
requireTokens('apps/fleet-mobile/services/control.ts',["getFleetManagedLocationPortfolio","business_managed_location_portfolio"]);
requireTokens('apps/fleet-mobile/app/index.tsx',[
  'getFleetManagedLocationPortfolio',
  'getFleetOnboardingGate',
  'Portfolio locations',
  'ONBOARDING IN PROGRESS'
]);

if(failures.length){
  console.error('Business/Fleet onboarding portfolio home audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Business/Fleet onboarding portfolio home audit passed.');
