import fs from 'node:fs';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const migration='supabase/migrations/20260911033000_four_tier_commercial_authority.sql';
for(const file of [migration,'apps/business-mobile/domain/businessTiers.ts','apps/business-mobile/app/onboarding.tsx','apps/fleet-mobile/app/onboarding.tsx']){
  if(!fs.existsSync(file))failures.push('missing '+file);
}
const sql=read(migration);
for(const token of [
  "'standard'","'growth'","'fleet'","'enterprise'",
  'enterprise_pricing_bands','49900','65000','125000','225000','425000','1025000','150000',
  'fleet_premium_limit','50','recommended_addons','upgrade_paths','business_tier_offer_catalog',
  'portfolio_fleet'
]) if(!sql.includes(token)) failures.push('commercial authority migration missing '+token);

const tiers=read('apps/business-mobile/domain/businessTiers.ts');
for(const token of ["return'Fleet'","return'Growth + Fleet'","return'Enterprise + Fleet'","return'Enterprise'","return'Growth'","return'Standard'"]) if(!tiers.includes(token)) failures.push('tierLabel missing '+token);
if(/fleet=enterprise\|\|/.test(tiers)) failures.push('Enterprise must not silently imply Fleet.');

const business=read('apps/business-mobile/app/onboarding.tsx');
for(const token of ['Standard → Growth → Fleet → Enterprise','recommended_addons','upgrade_paths','Enterprise pricing','50 Premium']) if(!business.includes(token)) failures.push('Business onboarding commercial presentation missing '+token);

const fleet=read('apps/fleet-mobile/app/onboarding.tsx');
for(const token of ['$75/month','50 Premium','Business Growth tools','recommended_addons']) if(!fleet.includes(token)) failures.push('Fleet onboarding tier presentation missing '+token);

if(failures.length){console.error('Four-tier commercial authority audit failed:');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log('Four-tier commercial authority audit passed.');
