import fs from 'node:fs';
const failures=[];
const required=['apps/consumer-mobile/app/qr.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/app/location/[id].tsx','apps/consumer-mobile/app/saved.tsx','apps/consumer-mobile/app/_layout.tsx'];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing consumer recovery file: ${file}`);
if(!failures.length){
 const qr=fs.readFileSync(required[0],'utf8');
 const route=fs.readFileSync(required[1],'utf8');
 const location=fs.readFileSync(required[2],'utf8');
 const saved=fs.readFileSync(required[3],'utf8');
 const layout=fs.readFileSync(required[4],'utf8');
 for(const token of ['AppState.addEventListener','Linking.openSettings','permission.canAskAgain===false','scanLocked','resolveQrAction','executeQrAction','Manual entry follows the exact same resolver'])if(!qr.includes(token))failures.push(`QR recovery missing ${token}`);
 if(!qr.includes("state!=='active'")||!qr.includes('setScanning(false)')||!qr.includes('setScanLocked(false)'))failures.push('QR camera must close and unlock when the app backgrounds.');
 if(!qr.includes('The resolved code is still here so you can retry.'))failures.push('QR action failures must preserve the resolved action for retry.');
 for(const token of ['const [hydrated,setHydrated]','SecureStore.getItemAsync(DRAFT_KEY)','Array.from(new Set([...restored,...current]))','if(!hydrated)return','SecureStore.setItemAsync(DRAFT_KEY','RefreshControl','Your saved stop order is still preserved','The local draft remains available'])if(!route.includes(token))failures.push(`Route recovery missing ${token}`);
 if(/useEffect\(\(\)=>\{SecureStore\.setItemAsync\(DRAFT_KEY,JSON\.stringify\(stopIds\)\)/.test(route))failures.push('Route must not persist an empty draft before secure hydration is complete.');
 if(!route.includes('setBuilt(null)')||!route.includes('Build the route before starting navigation.'))failures.push('Route mutations and navigation recovery must invalidate stale built state safely.');
 for(const token of ['findLatestEligibleReviewCheckIn','setCheckInId(eligible?.id||null)','if(submitting||!checkInId)return','setComment(\'\')','setAmenityDraft({})','setReviewPhotos([])'])if(!location.includes(token))failures.push(`Location contribution recovery missing ${token}`);
 if(!location.includes('Review saved, but amenity details could not be attached.')||!location.includes('Review saved, but one or more photos could not be uploaded.'))failures.push('Location must distinguish canonical review success from supplemental evidence attachment failures.');
 if(!saved.includes('RefreshControl')||!saved.includes('setRows(current=>current.filter'))failures.push('Saved must support refresh and preserve responsive removal state.');
 for(const token of ['handledNotificationResponses','response.notification.request.identifier','clearLastNotificationResponseAsync','markMobileNotificationRead','notificationDestination'])if(!layout.includes(token))failures.push(`Notification deep-link recovery missing ${token}`);
 if(!layout.includes('if(handledNotificationResponses.has(responseKey))return'))failures.push('Notification response handling must deduplicate repeated taps within the running app.');
 if(/service_role|record_data_feature_event/.test(qr+route+location+saved+layout))failures.push('Consumer recovery surfaces must not introduce privileged backend authority.');
}
if(failures.length){console.error('Native consumer recovery audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native consumer recovery audit passed.');
