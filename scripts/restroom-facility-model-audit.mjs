import fs from 'node:fs';

const failures=[];
const files={
  migration:'supabase/migrations/20260915193500_restroom_facility_identity.sql',
  mobileService:'apps/consumer-mobile/services/restroomFacilities.ts',
  mobileCore:'packages/mobile-core/src/index.ts',
  mobileLocations:'packages/mobile-core/src/locations.ts',
  mobileLocation:'apps/consumer-mobile/app/location/[id].tsx',
  webService:'src/services/restroomFacilities.js',
  webLocation:'src/runtime/LocationPage.jsx',
  mobilePresentation:'apps/consumer-mobile/services/locationPresentation.ts',
  mobileSignals:'apps/consumer-mobile/components/RestroomSignals.tsx',
  businessProduct:'apps/business-mobile/services/product.ts',
  businessLocations:'apps/business-mobile/app/locations.tsx',
};
for(const [name,path] of Object.entries(files)) if(!fs.existsSync(path)) failures.push(`missing ${name}: ${path}`);

if(!failures.length){
  const read=p=>fs.readFileSync(p,'utf8');
  const migration=read(files.migration).toLowerCase();
  const mobileService=read(files.mobileService);
  const mobileCore=read(files.mobileCore);
  const mobileLocations=read(files.mobileLocations);
  const mobileLocation=read(files.mobileLocation);
  const webService=read(files.webService);
  const webLocation=read(files.webLocation);
  const mobilePresentation=read(files.mobilePresentation);
  const mobileSignals=read(files.mobileSignals);
  const businessProduct=read(files.businessProduct);
  const businessLocations=read(files.businessLocations);

  for(const token of [
    'create table if not exists public.restroom_facilities',
    'restroom_facility_type',
    'restroom_facility_id',
    'list_location_restroom_facilities',
    'assign_check_in_restroom_facility',
    'copy_review_restroom_facility',
    'review_amenity_feedback',
    'location_amenity_observations',
    'family',
    'women',
    'men',
    'all_gender',
    'single_occupancy',
    'list_restroom_facility_summaries',
    'qr_codes',
    'qr_redemptions',
    'business_restroom_remediation_cases',
    'business_restroom_preventive_work_orders',
    'business_manage_restroom_facility',
    'business_restroom_facility_analytics',
    'business_assign_qr_restroom_facility',
    'fleet_restroom_facility_service_opportunities',
  ]) if(!migration.includes(token)) failures.push(`facility migration missing token: ${token}`);

  if(!mobileService.includes("rpc('list_location_restroom_facilities'")||!mobileService.includes("rpc('assign_check_in_restroom_facility'")) failures.push('native facility service must read facilities and attach the selected facility to the verified check-in.');
  if(!mobileCore.includes("export * from './locations'")) failures.push('mobile core must publicly re-export the canonical location domain.');
  if(!mobileLocations.includes('restroomFacilityId?:string|null')||!mobileLocations.includes('assign_check_in_restroom_facility')) failures.push('mobileCheckIn must carry optional restroom facility identity into canonical check-in evidence.');
  if(!mobileLocation.includes('Which restroom did you use?')||!mobileLocation.includes('selectedFacilityId')||!mobileLocation.includes('listRestroomFacilities')) failures.push('native location review flow must select a restroom facility before verified evidence is submitted when multiple facilities are known.');
  if(!webService.includes("rpc('list_location_restroom_facilities'")||!webService.includes("rpc('assign_check_in_restroom_facility'")) failures.push('web facility service must use canonical facility RPCs.');
  if(!webLocation.includes('Which restroom did you use?')||!webLocation.includes('selectedFacilityId')) failures.push('web location review flow must expose facility selection.');
  if(!mobilePresentation.includes('listRestroomFacilitySummaries')||!mobileSignals.includes('restroom_facility_summary')) failures.push('native discovery must surface known restroom facility types.');
  if(!businessProduct.includes('manageBusinessRestroomFacility')||!businessProduct.includes('getBusinessRestroomFacilityAnalytics')) failures.push('business product surface must expose facility management and analytics.');
  if(!businessLocations.includes('Restroom facilities')||!businessLocations.includes('Add restroom facility')) failures.push('business location UI must manage separate restroom facilities.');
  if(migration.includes("'accessible'")) failures.push('accessibility must remain a restroom attribute, not a facility identity.');
}

if(failures.length){
  console.error('Restroom facility identity audit failed:');
  for(const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Restroom facility identity audit passed.');
