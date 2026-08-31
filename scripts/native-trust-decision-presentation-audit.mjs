import fs from 'node:fs';
const files=['apps/consumer-mobile/services/routeTrust.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/saved.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/components/LocationAmenityInventory.tsx'];
const failures=[];for(const file of files)if(!fs.existsSync(file))failures.push(`missing trust decision file: ${file}`);
if(!failures.length){const read=file=>fs.readFileSync(file,'utf8'),trust=read(files[0]),explore=read(files[1]),saved=read(files[2]),route=read(files[3]),location=read(files[4]);
 for(const label of ['Strong evidence','Recent evidence','Limited evidence','Needs verification'])if(!trust.includes(label))failures.push(`Shared trust confidence model missing label: ${label}`);
 if(!trust.includes('trustEvidenceLine')||!trust.includes('routeTrustScore')||!trust.includes('bestEvidencedStop'))failures.push('Trust guidance must centralize scoring, evidence summaries, and strongest-evidence selection.');
 if(!explore.includes('bestEvidencedStop(rows)')||!explore.includes('Best evidenced nearby')||!explore.includes("{isBest?'✓':'WC'}"))failures.push('Explore must highlight strongest evidence in list and map surfaces.');
 if(!explore.includes('does not reorder nearby results'))failures.push('Explore guidance must state that trust highlighting does not reorder nearby results.');
 if(!saved.includes('trustConfidenceLabel')||!saved.includes('trustEvidenceLine')||!saved.includes('saved order is unchanged'))failures.push('Saved must use shared trust confidence without reordering the shortlist.');
 if(!route.includes('trustConfidenceLabel')||!route.includes('trustEvidenceLine')||!route.includes('keeps your stop order exactly as you arranged it'))failures.push('Route must use shared trust confidence while preserving manual stop order.');
 if(!route.includes('function move(index:number,delta:number)'))failures.push('Manual route ordering controls must remain authoritative.');
 if(!location.includes('trustConfidenceLabel')||!location.includes('trustEvidenceLine'))failures.push('Location trust snapshot must use the shared confidence and evidence language.');
 if(/sort\([^)]*routeTrustScore|sort\([^)]*trust/i.test(explore+saved+route))failures.push('Trust guidance must not silently sort Explore, Saved, or Route by confidence score.');
}
if(failures.length){console.error('Native trust decision presentation audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}console.log('Native trust decision presentation audit passed.');
