import fs from 'node:fs';
const files=['apps/consumer-mobile/services/routeTrust.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/saved.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/components/LocationAmenityInventory.tsx'];
const failures=[];for(const file of files)if(!fs.existsSync(file))failures.push(`missing trust decision file: ${file}`);
if(!failures.length){const read=file=>fs.readFileSync(file,'utf8'),trust=read(files[0]),explore=read(files[1]),saved=read(files[2]),route=read(files[3]),location=read(files[4]);
 for(const label of ['Strong evidence','Recent evidence','Limited evidence','Needs verification'])if(!trust.includes(label))failures.push(`Shared trust confidence model missing label: ${label}`);
 for(const helper of ['trustEvidenceLine','trustReason','routeTrustScore','bestEvidencedStop'])if(!trust.includes(helper))failures.push(`Trust guidance missing shared helper: ${helper}`);
 if(!explore.includes('bestEvidencedStop(rows)')||!explore.includes('Best evidenced nearby')||!explore.includes("{isBest?'✓':'WC'}"))failures.push('Explore must highlight strongest evidence in list and map surfaces.');
 if(!explore.includes('does not reorder nearby results'))failures.push('Explore guidance must state that trust highlighting does not reorder nearby results.');
 if(!saved.includes('trustConfidenceLabel')||!saved.includes('trustEvidenceLine')||!saved.includes('trustReason')||!saved.includes('saved order is unchanged'))failures.push('Saved must explain shared trust confidence without reordering the shortlist.');
 for(const action of ['Navigate best','View evidence','Add best to route'])if(!saved.includes(action))failures.push(`Saved best-evidence guidance missing action: ${action}`);
 if(!route.includes('trustConfidenceLabel')||!route.includes('trustEvidenceLine')||!route.includes('trustReason')||!route.includes('keeps your stop order exactly as you arranged it unless you explicitly choose'))failures.push('Route must explain shared trust confidence while preserving manual stop order by default.');
 if(!route.includes('function move(index:number,delta:number)')||!route.includes('function moveBestFirst()')||!route.includes('Move best first'))failures.push('Route must keep manual ordering authoritative and make trust-based reordering an explicit user action only.');
 if(!route.includes("router.push(`/location/${bestStopId}`)"))failures.push('Route trust guidance must allow opening the best stop evidence directly.');
 if(!location.includes('trustConfidenceLabel')||!location.includes('trustEvidenceLine')||!location.includes('trustReason'))failures.push('Location trust snapshot must explain the shared confidence and evidence language.');
 if(!location.includes('Help strengthen this restroom')||!location.includes('verified review with current photos or amenity observations'))failures.push('Weak location evidence must tell users how to strengthen the trust network.');
 if(/sort\([^)]*routeTrustScore|sort\([^)]*trust/i.test(explore+saved+route))failures.push('Trust guidance must not silently sort Explore, Saved, or Route by confidence score.');
}
if(failures.length){console.error('Native trust decision presentation audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}console.log('Native trust decision presentation audit passed.');
