import fs from 'node:fs';

const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const required=[
  'supabase/migrations/20260911030000_business_onboarding_tier_authority.sql',
  'apps/business-mobile/domain/businessTiers.ts',
  'apps/business-mobile/app/onboarding.tsx',
  'apps/fleet-mobile/app/onboarding.tsx'
];
for(const file of required) if(!fs.existsSync(file)) failures.push('missing '+file);

const migration=read(required[0]);
for(const token of [
  "'standard'","'growth'","'enterprise'",
  "'recommended_tier'","'tier_reason'","'tier_options'",
  "'fleet_included'","business_growth","max_locations=5"
]) if(!migration.includes(token)) failures.push('tier authority migration missing '+token);

const tiers=read(required[1]);
if(/if\(caps\.fleet\)return'Fleet'/.test(tiers)) failures.push('Business tier label must never promote Fleet capability into a Business tier');
for(const token of ["return'Enterprise'","return'Growth'","return'Standard'"]) if(!tiers.includes(token)) failures.push('tierLabel missing '+token);

const business=read(required[2]);
for(const token of ['RECOMMENDED TIER','recommended_tier','tier_reason','tier_options','Fleet operations']) if(!business.includes(token)) failures.push('Business onboarding tier presentation missing '+token);

const fleet=read(required[3]);
for(const token of ['BUSINESS TIER','recommended_tier','tier_reason','Fleet operations']) if(!fleet.includes(token)) failures.push('Fleet onboarding tier presentation missing '+token);

if(failures.length){console.error('Business onboarding tier authority audit failed:');for(const f of failures)console.error('- '+f);process.exit(1)}
console.log('Business onboarding tier authority audit passed.');
