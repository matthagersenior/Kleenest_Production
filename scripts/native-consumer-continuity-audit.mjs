import fs from 'node:fs';
const failures=[];
const files=['apps/consumer-mobile/services/nearbyCache.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/app/activity.tsx','apps/consumer-mobile/app/notifications.tsx'];
for(const file of files)if(!fs.existsSync(file))failures.push(`missing continuity file: ${file}`);
if(!failures.length){
 const cache=fs.readFileSync(files[0],'utf8');
 const explore=fs.readFileSync(files[1],'utf8');
 const route=fs.readFileSync(files[2],'utf8');
 const activity=fs.readFileSync(files[3],'utf8');
 const notifications=fs.readFileSync(files[4],'utf8');
 for(const token of ['CONTINUITY_KEY','readNearbyContinuity','writeNearbyContinuity','selectedId','radiusMeters','origin','MAX_AGE_MS'])if(!cache.includes(token))failures.push(`nearby continuity cache missing ${token}`);
 if(!cache.includes("kleenest.native.nearby.continuity.v1")||!cache.includes("kleenest.native.nearby.public.v1"))failures.push('Nearby continuity must remain separate from the public nearby result cache.');
 for(const token of ['readNearbyContinuity','writeNearbyContinuity','preservedId','RefreshControl','keyboardShouldPersistTaps','fallback.selectedId','fallback.origin','cachedAgeLabel(cache.savedAt)','accessibilityRole="radiogroup"'])if(!explore.includes(token))failures.push(`Explore continuity missing ${token}`);
 if(!explore.includes("selectedId&&enriched.some")||!explore.includes("cache.rows.some")||!explore.includes("const mapVisible=Boolean(origin&&rows.some(hasCoordinates))"))failures.push('Explore must preserve a valid selected restroom and render cached map context when coordinates are available.');
 if(!explore.includes("writeNearbyCache(enriched,{selectedId:preservedId,origin:nextOrigin,radiusMeters:radius})"))failures.push('Live generic discovery must persist the last-good result context atomically.');
 if(!explore.includes("Live lookup failed. Showing cached bathrooms")||!explore.includes("pull to refresh live distance"))failures.push('Explore must clearly distinguish cached fallback from live discovery and expose recovery.');
 if(!route.includes('SecureStore')||!route.includes('kleenest.native.route.draft'))failures.push('Route continuity must retain the canonical SecureStore draft.');
 for(const [name,source] of [['Activity',activity],['Notifications',notifications]]){
  if(!source.includes('RefreshControl')||!source.includes('refreshing={loading}')||!source.includes('onRefresh={load}'))failures.push(`${name} must expose native pull-to-refresh without replacing its canonical data authority.`);
  if(!source.includes('accessibilityLiveRegion="polite"'))failures.push(`${name} must announce refresh/error state changes accessibly.`);
 }
 if(!activity.includes("accessibilityRole=\"tab\"")||!activity.includes("accessibilityState={{selected:mode===value}}"))failures.push('Activity timeline mode must preserve accessible selected state.');
 if(!notifications.includes("accessibilityRole=\"tab\"")||!notifications.includes("accessibilityState={{selected:filter===value}}"))failures.push('Notification filters must preserve accessible selected state.');
 if(!notifications.includes("setRows(current=>current.map")||!notifications.includes('All recent notifications marked read.'))failures.push('Mark-all-read must update the current inbox immediately without requiring a destructive reload.');
 if(/service_role|record_data_feature_event/.test(explore+cache+activity+notifications))failures.push('Consumer continuity must not introduce privileged backend authority.');
}
if(failures.length){console.error('Native consumer continuity audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native consumer continuity audit passed.');
