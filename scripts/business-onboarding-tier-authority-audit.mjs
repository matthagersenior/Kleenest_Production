import fs from 'node:fs';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const migration='supabase/migrations/20260911033000_four_tier_commercial_authority.sql';
const fleetAuthority='supabase/migrations/20260913112500_fleet_dispatcher_web_portal_authority.sql';
for(const file of [migration,fleetAuthority,'apps/business-mobile/domain/businessTiers.ts','apps/business-mobile/app/onboarding.tsx','apps/fleet-mobile/app/onboarding.tsx']){
  if(!fs.existsSync(file))failures.push('missing '+file);
}
const sql=read(migration);
const fleetSql=read(fleetAuthority);
for(const token of [
  "'standard'","'growth'","'fleet'","'enterprise'",
  'enterprise_pricing_bands','49900','65000','125000','225000','425000','1025000','150000',
  'fleet_premium_limit','50','recommended_addons','upgrade_paths','business_tier_offer_catalog',
  'portfolio_fleet'
]) if(!sql.includes(token)) failures.push('commercial authority migration missing '+token);

const tiers=read('apps/business-mobile/domain/businessTiers.ts');
for(const token of ["'Fleet + Enterprise'","'Fleet'","'Growth + Enterprise'","'Growth + Fleet'","'Enterprise + Fleet'","'Enterprise'","'Growth'","'Standard'"]) if(!tiers.includes(token)) failures.push('tierLabel missing '+token);
if(/const fleet=enterprise\|\|/.test(tiers)) failures.push('Enterprise must not silently imply Fleet.');

const business=read('apps/business-mobile/app/onboarding.tsx');
for(const token of ['Standard → Growth → Fleet → Enterprise','recommended_addons','upgrade_paths','Enterprise pricing','75 Premium']) if(!business.includes(token)) failures.push('Business onboarding commercial presentation missing '+token);

const fleet=read('apps/fleet-mobile/app/onboarding.tsx');
for(const token of ['$75/month','75 Premium','Business Growth tools','recommended_addons']) if(!fleet.includes(token)) failures.push('Fleet onboarding tier presentation missing '+token);

for(const token of ["'premium_users',75","includes 75 Premium users","75 Premium users"]) if(!fleetSql.includes(token)) failures.push('Current Fleet commercial authority missing '+token);

if(failures.length){console.error('Four-tier commercial authority audit failed:');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log('Four-tier commercial authority audit passed.');
