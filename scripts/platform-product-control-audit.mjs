import fs from 'node:fs';

const failures=[];
const must=(ok,message)=>{if(!ok)failures.push(message);};
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';

const files=[
  'supabase/migrations/20260912090000_platform_product_control_plane.sql',
  'supabase/migrations/20260912091000_fleet_75_premium_convergence.sql',
  'apps/platform-mobile/services/platformProducts.ts',
  'apps/platform-mobile/app/integrations.tsx',
  'packages/mobile-sdk/package.json',
  'packages/mobile-sdk/src/index.ts',
  'packages/mobile-sdk/README.md',
  'supabase/functions/platform-api/index.ts',
  'supabase/functions/platform-distribution/index.ts',
  '.github/workflows/platform-package-build.yml',
];
for(const file of files)must(fs.existsSync(file),`missing ${file}`);

const migration=read('supabase/migrations/20260912090000_platform_product_control_plane.sql');
for(const token of [
  'platform_integration_products',
  'platform_api_endpoints',
  'platform_partner_product_access',
  'owner_platform_product_control_snapshot',
  'owner_upsert_platform_integration_product',
  'owner_delete_platform_integration_product',
  'owner_upsert_platform_api_endpoint',
  'owner_delete_platform_api_endpoint',
  'owner_create_platform_pilot',
  'owner_upsert_platform_partner_product_access',
  'platform_route_access_decision',
  'platform_public_distribution_manifest',
])must(migration.includes(token),`platform product migration missing ${token}`);

for(const code of [
  'rest_api','js_sdk','mobile_sdk','widget','map_layer','route_sdk','deep_links','webhooks','ai_mcp'
])must(migration.includes(`'${code}'`),`platform product seed missing ${code}`);

for(const handler of ['recommend_nearby','recommend_route'])
  must(migration.includes(`'${handler}'`),`API endpoint handler seed missing ${handler}`);

const api=read('supabase/functions/platform-api/index.ts');
for(const token of ['platform_route_access_decision','handler_key','product_disabled','endpoint_disabled'])
  must(api.includes(token),`platform API missing owner-controlled route behavior: ${token}`);

const distribution=read('supabase/functions/platform-distribution/index.ts');
for(const token of ['platform_public_distribution_manifest','products','mobileSdk'])
  must(distribution.includes(token),`distribution manifest missing owner-controlled product catalog: ${token}`);

const service=read('apps/platform-mobile/services/platformProducts.ts');
for(const token of [
  'owner_platform_product_control_snapshot',
  'owner_upsert_platform_integration_product',
  'owner_delete_platform_integration_product',
  'owner_upsert_platform_api_endpoint',
  'owner_delete_platform_api_endpoint',
  'owner_create_platform_pilot',
  'owner_upsert_platform_partner_product_access',
])must(service.includes(token),`KleenestOS platform product service missing ${token}`);

const ui=read('apps/platform-mobile/app/integrations.tsx');
for(const token of [
  'Integration Products',
  'API Endpoints',
  'Pilot Workspaces',
  'Create pilot',
  'Product status',
  'Release channel',
  'Runtime config',
  'Sample request',
  'Disable endpoint',
])must(ui.includes(token),`KleenestOS integration control UI missing ${token}`);

const ownerIndex=read('apps/platform-mobile/app/index.tsx');
must(ownerIndex.includes('/integrations'),'KleenestOS home must link to integration product control');
const ownerLayout=read('apps/platform-mobile/app/_layout.tsx');
must(ownerLayout.includes('name="integrations"'),'KleenestOS layout must register integrations screen');

const pricing=read('supabase/migrations/20260912091000_fleet_75_premium_convergence.sql');
for(const token of ['up_to_75_premium_users','includes 75 Premium users','max_users=75','fleet_premium_limit=75'])
  must(pricing.includes(token),`Fleet 75-seat convergence missing ${token}`);

const mobilePackage=read('packages/mobile-sdk/package.json');
must(mobilePackage.includes('"@kleenest/mobile-sdk"'),'mobile SDK package name missing');
const mobileSource=read('packages/mobile-sdk/src/index.ts');
for(const token of ['KleenestMobileClient','recommendNearby','recommendRoute','openPlace'])
  must(mobileSource.includes(token),`mobile SDK missing ${token}`);

const workflow=read('.github/workflows/platform-package-build.yml');
for(const token of ['packages/mobile-sdk/**','Build mobile-sdk','@kleenest/mobile-sdk'])
  must(workflow.includes(token),`platform package workflow missing ${token}`);

if(failures.length){
  console.error(`Platform product control gate failed with ${failures.length} issue${failures.length===1?'':'s'}:`);
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Platform product control gate passed: owner CRUD, pilot entitlements, runtime route control, distribution catalog, mobile SDK, and Fleet 75-seat packaging are converged.');
