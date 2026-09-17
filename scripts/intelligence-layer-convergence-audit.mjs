import fs from 'node:fs';

const failures=[];
const files={
  migration:'supabase/migrations/20260916214500_kleenest_intelligence_layer.sql',
  businessService:'apps/business-mobile/services/intelligenceLayer.ts',
  businessUi:'apps/business-mobile/app/service-freshness.tsx',
  consumerService:'apps/consumer-mobile/services/intelligenceLayer.ts',
  consumerUi:'apps/consumer-mobile/app/intelligence.tsx',
  fleetService:'apps/fleet-mobile/services/routeReliefIntelligence.ts',
  fleetUi:'apps/fleet-mobile/app/coverage.tsx',
  ownerService:'apps/platform-mobile/services/intelligenceLayer.ts',
  ownerUi:'apps/platform-mobile/app/intelligence.tsx',
  search:'packages/mobile-core/src/appSearch.ts',
  businessHome:'apps/business-mobile/app/index.tsx',
  consumerLocation:'apps/consumer-mobile/app/location/[id].tsx',
  consumerPassport:'apps/consumer-mobile/app/passport.tsx',
  fleetHome:'apps/fleet-mobile/app/index.tsx',
  ownerControl:'apps/platform-mobile/app/control.tsx',
};
for(const [name,path] of Object.entries(files)) if(!fs.existsSync(path)) failures.push(`missing ${name}: ${path}`);

if(!failures.length){
  const read=p=>fs.readFileSync(p,'utf8');
  const migration=read(files.migration).toLowerCase();
  const businessService=read(files.businessService);
  const businessUi=read(files.businessUi);
  const consumerService=read(files.consumerService);
  const consumerUi=read(files.consumerUi);
  const fleetService=read(files.fleetService);
  const fleetUi=read(files.fleetUi);
  const ownerService=read(files.ownerService);
  const ownerUi=read(files.ownerUi);
  const search=read(files.search);
  const businessHome=read(files.businessHome);
  const consumerLocation=read(files.consumerLocation);
  const consumerPassport=read(files.consumerPassport);
  const fleetHome=read(files.fleetHome);
  const ownerControl=read(files.ownerControl);

  for(const token of [
    'create table if not exists public.business_restroom_service_updates',
    'create table if not exists public.kleenest_evidence_events',
    'create table if not exists public.kleenest_intelligence_policy',
    'business_record_restroom_service_update',
    'location_kleenest_now',
    'location_facility_passport',
    'kleenest_verified_access',
    'business_trust_recovery',
    'business_fix_first_queue',
    'fleet_route_relief_coverage',
    'owner_intelligence_overview',
    'owner_explain_location_intelligence',
    'business_reported',
    'business_can_manage',
    'freshness_score',
    'community',
    'revoke all on public.business_restroom_service_updates',
  ]) if(!migration.includes(token)) failures.push(`migration missing token: ${token}`);

  for(const token of ['recordRestroomServiceUpdate','getBusinessTrustRecovery','getBusinessFixFirstQueue']) if(!businessService.includes(token)) failures.push(`Business intelligence service missing ${token}`);
  for(const token of ['Mark cleaned','Trust Recovery','Fix First','Business reported']) if(!businessUi.includes(token)) failures.push(`Business service-freshness UI missing ${token}`);
  for(const token of ["href:'/service-freshness'",'Service freshness']) if(!businessHome.includes(token)) failures.push(`Business home must preserve existing domains and add ${token}`);

  for(const token of ['getKleenestNow','getFacilityPassport','getVerifiedAccess']) if(!consumerService.includes(token)) failures.push(`Consumer intelligence service missing ${token}`);
  for(const token of ['KLEENEST NOW','Bathroom Fit','Facility Passport','Verified Access']) if(!consumerUi.includes(token)) failures.push(`Consumer intelligence UI missing ${token}`);
  for(const token of ['Kleenest Now','Facility Passport']) if(!consumerLocation.includes(token)) failures.push(`Consumer location detail must add ${token} without replacing existing detail actions`);
  if(!consumerPassport.includes('Journey collections')) failures.push('Consumer Passport must add Journey collections while preserving existing Passport UI.');

  for(const token of ['getRouteReliefCoverage','getVerifiedAccess']) if(!fleetService.includes(token)) failures.push(`Fleet route-relief service missing ${token}`);
  for(const token of ['ROUTE COVERAGE','Restroom desert','Preferred access']) if(!fleetUi.includes(token)) failures.push(`Fleet coverage UI missing ${token}`);
  if(!fleetHome.includes("href:'/coverage'")) failures.push('Fleet home must add coverage without removing existing routes.');

  for(const token of ['getOwnerIntelligenceOverview','explainLocationIntelligence','updateIntelligencePolicy']) if(!ownerService.includes(token)) failures.push(`Owner intelligence service missing ${token}`);
  for(const token of ['PLATFORM GRAPH','WHY DID THIS HAPPEN?','LAUNCH READINESS','INTELLIGENCE POLICY']) if(!ownerUi.includes(token)) failures.push(`Owner intelligence UI missing ${token}`);
  if(!ownerControl.includes('/intelligence')) failures.push('Owner Control must add Intelligence workspace without replacing existing controls.');

  for(const token of ['Kleenest Now','Bathroom Fit','Facility Passport','Trust Recovery','Fix First','Route Coverage','Platform Graph','Launch Readiness','Verified Access']) if(!search.includes(token)) failures.push(`app search missing ${token}`);
}

if(failures.length){
  console.error('Kleenest intelligence layer convergence audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Kleenest intelligence layer convergence audit passed.');
