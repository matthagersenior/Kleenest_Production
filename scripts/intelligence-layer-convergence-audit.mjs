import fs from 'node:fs';

const failures=[];
const files={
  migration:'supabase/migrations/20260916214500_kleenest_intelligence_layer.sql',
  sharedCore:'packages/mobile-core/src/intelligence.ts',
  publicEntry:'packages/mobile-core/src/publicEntry.ts',
  businessService:'apps/business-mobile/services/intelligenceLayer.ts',
  businessUi:'apps/business-mobile/app/service-freshness.tsx',
  consumerService:'apps/consumer-mobile/services/intelligenceLayer.ts',
  consumerUi:'apps/consumer-mobile/app/intelligence.tsx',
  consumerLocation:'apps/consumer-mobile/app/location/[id].tsx',
  consumerLocationIntelligence:'apps/consumer-mobile/components/LocationAmenityInventory.tsx',
  consumerPassport:'apps/consumer-mobile/app/passport.tsx',
  consumerPassportService:'apps/consumer-mobile/services/passport.ts',
  fleetService:'apps/fleet-mobile/services/routeReliefIntelligence.ts',
  fleetUi:'apps/fleet-mobile/app/coverage.tsx',
  fleetHome:'apps/fleet-mobile/app/index.tsx',
  ownerService:'apps/platform-mobile/services/intelligenceLayer.ts',
  ownerUi:'apps/platform-mobile/app/intelligence.tsx',
  ownerHome:'apps/platform-mobile/app/index.tsx',
  search:'packages/mobile-core/src/appSearch.ts',
  businessHome:'apps/business-mobile/app/index.tsx',
};
for(const [name,path] of Object.entries(files)) if(!fs.existsSync(path)) failures.push(`missing ${name}: ${path}`);

if(!failures.length){
  const read=p=>fs.readFileSync(p,'utf8');
  const migration=read(files.migration).toLowerCase();
  const sharedCore=read(files.sharedCore);
  const publicEntry=read(files.publicEntry);
  const businessService=read(files.businessService);
  const businessUi=read(files.businessUi);
  const consumerService=read(files.consumerService);
  const consumerUi=read(files.consumerUi);
  const consumerLocation=read(files.consumerLocation);
  const consumerLocationIntelligence=read(files.consumerLocationIntelligence);
  const consumerPassport=read(files.consumerPassport);
  const consumerPassportService=read(files.consumerPassportService);
  const fleetService=read(files.fleetService);
  const fleetUi=read(files.fleetUi);
  const fleetHome=read(files.fleetHome);
  const ownerService=read(files.ownerService);
  const ownerUi=read(files.ownerUi);
  const ownerHome=read(files.ownerHome);
  const search=read(files.search);
  const businessHome=read(files.businessHome);

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
    'consumer_journey_collections',
    'business_reported',
    'business_can_manage',
    'freshness_score',
    'community',
    'revoke all on public.business_restroom_service_updates',
  ]) if(!migration.includes(token)) failures.push(`migration missing token: ${token}`);

  for(const token of [
    'KleenestNowProjection','FacilityPassportProjection','VerifiedAccessProjection',
    'BathroomFitPreferences','RestroomServiceEvent','BusinessIntelligenceLocation',
    'getKleenestNow','getFacilityPassport','getVerifiedAccess','getBathroomFit',
    'getLocationExplanation','getLocationProofCard','setLocationTrustWatch','getLocationTrustChanges',
    'getConsumerRouteConfidence','getBathroomFitPreferences','updateBathroomFitPreferences','getConsumerIntelligence',
    'listBusinessIntelligenceLocations','recordRestroomServiceUpdate','getBusinessTrustRecovery','getBusinessFixFirstQueue',
    'getBusinessLocalFreshnessBenchmark','getBusinessIntelligenceLayer',
    'getFleetRouteReliefCoverage','getOwnerIntelligenceOverview','getOwnerProductTruth',
    'explainOwnerLocationIntelligence','getIntelligencePolicy','updateIntelligencePolicy',
    'listIntelligenceLocationCandidates','getOwnerIntelligenceWorkspace'
  ]) if(!sharedCore.includes(token)) failures.push(`Shared intelligence core missing ${token}`);
  if(!publicEntry.includes("export * from './intelligence'")) failures.push('mobile-core public entry must export the shared intelligence SDK.');

  for(const [label,service] of [
    ['Consumer',consumerService],['Business',businessService],['Fleet',fleetService],['Owner',ownerService]
  ]){
    if(!service.includes("from '@kleenest/mobile-core'")) failures.push(`${label} intelligence adapter must consume @kleenest/mobile-core.`);
    if(service.includes('getKleenestSupabaseClient')||service.includes('async function rpc')||service.includes('.rpc(')) failures.push(`${label} intelligence adapter must not define a second Supabase/RPC intelligence client.`);
  }

  for(const token of ['recordRestroomServiceUpdate','getBusinessTrustRecovery','getBusinessFixFirstQueue']) if(!businessService.includes(token)) failures.push(`Business intelligence service missing ${token}`);
  for(const token of ['Mark cleaned','Trust Recovery','Fix First','Business reported']) if(!businessUi.includes(token)) failures.push(`Business service-freshness UI missing ${token}`);
  for(const token of ["href:'/service-freshness'",'Service freshness']) if(!businessHome.includes(token)) failures.push(`Business home must preserve existing domains and add ${token}`);

  for(const token of ['getKleenestNow','getFacilityPassport','getVerifiedAccess']) if(!consumerService.includes(token)) failures.push(`Consumer intelligence service missing ${token}`);
  for(const token of ['KLEENEST NOW','Bathroom Fit','Facility Passport','Verified Access']) if(!consumerUi.includes(token)) failures.push(`Consumer intelligence UI missing ${token}`);
  if(!consumerLocation.includes('LocationAmenityInventory')) failures.push('Consumer location detail must preserve its existing trust/evidence surface.');
  for(const token of ['KLEENEST NOW','Facility Passport',"pathname:'/intelligence'",'locationId']) if(!consumerLocationIntelligence.includes(token)) failures.push(`Consumer location intelligence entry missing ${token}`);
  if(!consumerPassport.includes('next_collections')) failures.push('Consumer Passport must preserve its existing collection-card UI.');
  for(const token of ['consumer_journey_collections','journey_collections','next_collections']) if(!consumerPassportService.includes(token)) failures.push(`Consumer Passport journey integration missing ${token}`);

  for(const token of ['getRouteReliefCoverage','getVerifiedAccess']) if(!fleetService.includes(token)) failures.push(`Fleet route-relief service missing ${token}`);
  const fleetUiLower=fleetUi.toLowerCase();
  for(const token of ['route coverage','restroom desert','preferred access']) if(!fleetUiLower.includes(token)) failures.push(`Fleet coverage UI missing ${token}`);
  if(!fleetHome.includes("['/coverage','Route Coverage'")) failures.push('Fleet home must preserve all existing routes and expose Route Coverage.');

  for(const token of ['getOwnerIntelligenceOverview','explainLocationIntelligence','updateIntelligencePolicy']) if(!ownerService.includes(token)) failures.push(`Owner intelligence service missing ${token}`);
  for(const token of ['PLATFORM GRAPH','WHY DID THIS HAPPEN?','LAUNCH READINESS','INTELLIGENCE POLICY']) if(!ownerUi.includes(token)) failures.push(`Owner intelligence UI missing ${token}`);
  if(!ownerHome.includes("['/intelligence','Intelligence Lab'")) failures.push('Owner Home must expose the additive Intelligence workspace without replacing existing controls.');

  for(const token of ['Kleenest Now','Bathroom Fit','Facility Passport','Trust Recovery','Fix First','Route Coverage','Platform Graph','Launch Readiness','Verified Access']) if(!search.includes(token)) failures.push(`app search missing ${token}`);
}

if(failures.length){
  console.error('Kleenest intelligence layer convergence audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Kleenest intelligence layer convergence audit passed.');
