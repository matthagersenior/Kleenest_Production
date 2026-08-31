import fs from 'node:fs';

const required=[
  'apps/consumer-mobile/services/amenities.ts',
  'apps/consumer-mobile/components/LocationAmenityInventory.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'supabase/migrations/20260831000500_mobile_review_amenity_progression.sql',
];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing native amenity inventory file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const inventory=fs.readFileSync(required[1],'utf8');
  const location=fs.readFileSync(required[2],'utf8');
  const migration=fs.readFileSync(required[3],'utf8');
  if(!service.includes("from('amenities')")||!service.includes("rpc('record_review_amenity_inventory'")) failures.push('Mobile amenity inventory must use canonical amenity catalog and review inventory RPC.');
  if(!service.includes("rpc('get_location_amenity_inventory'")) failures.push('Mobile amenity inventory must read canonical aggregated location quantities.');
  if(!service.includes('quantity')||!service.includes('0 to 1000')) failures.push('Mobile amenity inventory must preserve quantity validation.');
  if(!service.includes("rpc('award_review_amenity_progression'")) failures.push('Verified amenity inventory must request the protected progression award after persistence.');
  const recordStart=service.indexOf('export async function recordReviewAmenityInventory');
  const recordBody=recordStart>=0?service.slice(recordStart):'';
  const inventoryCall=recordBody.indexOf("rpc('record_review_amenity_inventory'");
  const inventorySuccess=recordBody.indexOf('if (error) throw error;',inventoryCall);
  const awardCall=recordBody.indexOf('awardReviewAmenityProgression(reviewId)',inventorySuccess);
  if(inventoryCall<0||inventorySuccess<inventoryCall||awardCall<inventorySuccess) failures.push('Amenity progression must never be requested before canonical inventory persistence succeeds.');
  if(!recordBody.includes('awardReviewAmenityProgression(reviewId).catch(() => null)')) failures.push('Optional amenity progression failure must not make persisted review inventory appear failed.');
  if(!location.includes('AMENITIES DISCOVERED')||!location.includes('What is here, and how many?')) failures.push('Location review must expose amenity type and count collection.');
  if(!location.includes('selectedAmenities')||!location.includes('recordReviewAmenityInventory')) failures.push('Selected amenity counts must persist with the created review.');
  if(!location.includes('Count')||!location.includes('Needs attention')) failures.push('Each selected amenity must expose count and condition controls.');
  if(!location.includes('LocationAmenityInventory')||!inventory.includes('COMMUNITY AMENITY INVENTORY')||!inventory.includes('observed_quantity')) failures.push('Location detail must read back community amenity quantities.');
  for(const token of ["'amenity_inventory'","security definer","progression_eligible","review_amenity_feedback","record_progression_action('amenity_inventory'","revoke all on function public.award_review_amenity_progression(uuid) from public, anon","grant execute on function public.award_review_amenity_progression(uuid) to authenticated"]){
    if(!migration.toLowerCase().includes(token.toLowerCase())) failures.push(`Amenity progression migration missing security/progression token: ${token}`);
  }
}
if(failures.length){console.error('Native amenity inventory audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native amenity inventory audit passed.');
