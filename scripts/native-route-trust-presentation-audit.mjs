import fs from 'node:fs';

const componentPath='apps/consumer-mobile/components/PhotoEvidencePreview.tsx';
const activityPath='apps/consumer-mobile/app/activity.tsx';
const socialPath='apps/consumer-mobile/app/social.tsx';
const routePath='apps/consumer-mobile/app/route.tsx';
const routeTrustPath='apps/consumer-mobile/services/routeTrust.ts';
const locationTrustPath='apps/consumer-mobile/services/locationTrust.ts';
const failures=[];
for(const file of[componentPath,activityPath,socialPath,routePath,routeTrustPath,locationTrustPath])if(!fs.existsSync(file))failures.push(`missing route/photo presentation file: ${file}`);
if(!failures.length){
 const component=fs.readFileSync(componentPath,'utf8'),activity=fs.readFileSync(activityPath,'utf8'),social=fs.readFileSync(socialPath,'utf8'),route=fs.readFileSync(routePath,'utf8'),routeTrust=fs.readFileSync(routeTrustPath,'utf8'),locationTrust=fs.readFileSync(locationTrustPath,'utf8');
 if(!component.includes('maxCount=3')||!component.includes('accessibilityLabel="Restroom review evidence photo"'))failures.push('Shared photo evidence preview must provide bounded previews and accessibility context.');
 if(!activity.includes("import PhotoEvidencePreview from '../components/PhotoEvidencePreview'")||!activity.includes('maxCount={2}'))failures.push('Activity must use the shared photo evidence preview with its two-photo limit.');
 if(!social.includes("import PhotoEvidencePreview from '../components/PhotoEvidencePreview'")||!social.includes('maxCount={3}'))failures.push('Community Pulse must use the shared photo evidence preview with its three-photo limit.');
 if(/function PhotoEvidencePreview/.test(activity+social))failures.push('Activity and Community must not maintain duplicate photo preview components.');
 if(!route.includes('listLocationTrustSummaries')||!route.includes('attachLocationTrust'))failures.push('Route stops must be batch-enriched through the canonical location trust authority.');
 if(!route.includes('bestEvidencedStop(stops)')||!route.includes('BEST EVIDENCE')||!route.includes('guidance only'))failures.push('Route must surface non-destructive trust guidance and best-evidenced stop context.');
 if(!route.includes('function move(index:number,delta:number)')||!route.includes('Up')||!route.includes('Down'))failures.push('Route must preserve explicit user-controlled stop ordering.');
 if(/sort\([^\n]*routeTrustScore|setStopIds\([^\n]*bestEvidenced/i.test(route))failures.push('Trust guidance must not silently reorder user route stops.');
 if(!routeTrust.includes('routeTrustScore')||!routeTrust.includes('visitFreshness')||!routeTrust.includes('Needs verified evidence'))failures.push('Route trust model must use evidence quantity plus shared freshness semantics.');
 if(!locationTrust.includes("rpc('mobile_location_trust_summaries'"))failures.push('Route trust must remain grounded in the canonical aggregate trust RPC.');
 if(/verified_distance_meters|verifiedDistanceMeters/.test(route+routeTrust))failures.push('Route aggregate trust guidance must not expose raw verification distance.');
}
if(failures.length){console.error('Native route trust presentation audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native route trust presentation audit passed.');
