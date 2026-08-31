import fs from 'node:fs';

const migrationPath='supabase/migrations/20260831074000_mobile_location_trust_summary_authority.sql';
const servicePath='apps/consumer-mobile/services/locationTrust.ts';
const explorePath='apps/consumer-mobile/app/explore.tsx';
const inventoryPath='apps/consumer-mobile/components/LocationAmenityInventory.tsx';
const formatterPath='apps/consumer-mobile/services/evidenceFormatting.ts';
const failures=[];
for(const file of[migrationPath,servicePath,explorePath,inventoryPath,formatterPath])if(!fs.existsSync(file))failures.push(`missing location trust file: ${file}`);
if(!failures.length){
 const migration=fs.readFileSync(migrationPath,'utf8'),service=fs.readFileSync(servicePath,'utf8'),explore=fs.readFileSync(explorePath,'utf8'),inventory=fs.readFileSync(inventoryPath,'utf8'),formatter=fs.readFileSync(formatterPath,'utf8');
 if(!migration.includes('mobile_location_trust_summaries')||!migration.includes("where r.status='published'")||!migration.includes('count(distinct p.check_in_id)')||!migration.includes('count(rp.id)')||!migration.includes('count(distinct ao.amenity_id)'))failures.push('Trust summary must aggregate only published-review-linked evidence.');
 if(!migration.includes("set search_path = ''")||!migration.includes('A maximum of 100 location ids may be requested'))failures.push('Trust summary RPC must use empty search path and bounded batching.');
 if(!service.includes("rpc('mobile_location_trust_summaries'")||!service.includes('.slice(0,100)')||!service.includes('attachLocationTrust'))failures.push('Mobile trust adapter must batch through the canonical RPC.');
 if(!explore.includes('listLocationTrustSummaries(data.map')||!explore.includes('attachLocationTrust(data,summaries)'))failures.push('Explore must enrich the result set in one batched trust request.');
 for(const field of ['trust?.verified_visit_count','trust?.photo_evidence_count','trust?.amenity_evidence_count','trust?.latest_verified_at'])if(!explore.includes(field))failures.push(`Explore must surface trust field: ${field}`);
 if(!explore.includes('visitFreshness(trust?.latest_verified_at)'))failures.push('Explore trust freshness must be derived with the shared formatter.');
 if(!inventory.includes('getLocationTrustSummary(locationId)')||!inventory.includes('COMMUNITY TRUST SNAPSHOT'))failures.push('Location detail must surface the shared trust summary authority.');
 if(!explore.includes('visitFreshness')||!inventory.includes('visitFreshness'))failures.push('Trust freshness must reuse the shared evidence formatter.');
 if(/distance_meters|verifiedDistanceMeters/.test(service+inventory))failures.push('Aggregate trust summaries must not expose raw verification distance.');
 if(!formatter.includes('verificationDistanceBucket'))failures.push('Shared privacy-aware distance formatting must remain available for per-review evidence.');
}
if(failures.length){console.error('Native location trust summary audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native location trust summary audit passed.');
