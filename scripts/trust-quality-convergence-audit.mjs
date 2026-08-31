import fs from 'node:fs';

const files={
  amenityMigration:'supabase/migrations/20260831165800_mobile_amenity_trust_quality_convergence.sql',
  businessMigration:'supabase/migrations/20260831165900_business_restroom_trust_quality_control_plane.sql',
  amenityService:'apps/consumer-mobile/services/amenities.ts',
  trustService:'apps/consumer-mobile/services/locationTrust.ts',
  inventory:'apps/consumer-mobile/components/LocationAmenityInventory.tsx',
  workspaces:'src/services/workspaces.js',
  business:'src/runtime/BusinessWorkspacePage.jsx',
};
const failures=[];
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`missing ${name}: ${file}`);
if(!failures.length){
  const amenityMigration=fs.readFileSync(files.amenityMigration,'utf8').toLowerCase();
  const businessMigration=fs.readFileSync(files.businessMigration,'utf8').toLowerCase();
  const amenityService=fs.readFileSync(files.amenityService,'utf8');
  const trustService=fs.readFileSync(files.trustService,'utf8');
  const inventory=fs.readFileSync(files.inventory,'utf8');
  const workspaces=fs.readFileSync(files.workspaces,'utf8');
  const business=fs.readFileSync(files.business,'utf8');

  if(amenityMigration.includes('review_amenity_feedback'))failures.push('Canonical amenity aggregation must not union legacy review feedback after review evidence convergence.');
  for(const token of ['location_amenity_observations','contributor_count','present_count','absent_count','status_conflict','confidence_score','freshness','get_location_trust_quality','needs_reverification','contradiction_count','quality_score'])if(!amenityMigration.includes(token))failures.push(`Amenity trust migration missing ${token}.`);
  for(const token of ['revoke all on function public.get_location_amenity_inventory(uuid) from public, anon','grant execute on function public.get_location_amenity_inventory(uuid) to authenticated, service_role','revoke all on function public.get_location_trust_quality(uuid) from public, anon','grant execute on function public.get_location_trust_quality(uuid) to authenticated, service_role'])if(!amenityMigration.includes(token))failures.push(`Amenity trust authority missing ${token}.`);
  for(const token of ['business_restroom_trust_quality','business_members','get_location_trust_quality','get_location_trust_conflicts','business_access_denied','revoke all on function public.business_restroom_trust_quality(uuid,uuid) from public, anon','grant execute on function public.business_restroom_trust_quality(uuid,uuid) to authenticated, service_role'])if(!businessMigration.includes(token))failures.push(`Business trust quality migration missing ${token}.`);
  for(const token of ['contributor_count','present_count','absent_count','status_conflict','confidence_score','freshness'])if(!amenityService.includes(token))failures.push(`Amenity service missing quality field ${token}.`);
  if(!trustService.includes("rpc('get_location_trust_quality'")||!trustService.includes('needs_reverification')||!trustService.includes('contradiction_count'))failures.push('Mobile trust service must consume the canonical trust quality RPC.');
  for(const token of ['REVERIFICATION NEEDED','Conflicting reports','confidence','canonical observation evidence only'])if(!inventory.includes(token))failures.push(`Mobile trust presentation missing ${token}.`);
  if(!workspaces.includes("rpc('business_restroom_trust_quality'")||!workspaces.includes('trustQuality'))failures.push('Business workspace service must load trust quality control-plane data.');
  for(const token of ['TRUST QUALITY CONTROL','Needs reverification','Evidence conflicts','business_restroom_trust_quality','contradiction_count','needs_reverification'])if(!business.includes(token)&&token!=='business_restroom_trust_quality')failures.push(`Business trust presentation missing ${token}.`);
}
if(failures.length){console.error('Trust quality convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Trust quality convergence audit passed.');
