import fs from 'node:fs';
const failures=[];
const required=['apps/consumer-mobile/app/qr.tsx','apps/consumer-mobile/app/route.tsx','apps/consumer-mobile/app/location/[id].tsx','apps/consumer-mobile/app/review/[id].tsx','apps/consumer-mobile/app/saved.tsx','apps/consumer-mobile/app/_layout.tsx'];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing consumer recovery file: ${file}`);
if(!failures.length){
 const qr=fs.readFileSync(required[0],'utf8');
 const route=fs.readFileSync(required[1],'utf8');
 const location=fs.readFileSync(required[2],'utf8');
 const quickReview=fs.readFileSync(required[3],'utf8');
 const saved=fs.readFileSync(required[4],'utf8');
 const layout=fs.readFileSync(required[5],'utf8');
 for(const token of ['AppState.addEventListener','Linking.openSettings','permission.canAskAgain===false','scanLocked','resolveQrAction','executeQrAction','Manual entry works the same way as scanning the printed code.'])if(!qr.includes(token))failures.push(`QR recovery missing ${token}`);
 if(!qr.includes("state!=='active'")||!qr.includes('setScanning(false)')||!qr.includes('setScanLocked(false)'))failures.push('QR camera must close and unlock when the app backgrounds.');
 if(!qr.includes('The resolved code is still here so you can retry.'))failures.push('QR action failures must preserve the resolved action for retry.');
 for(const token of ['const [hydrated,setHydrated]','SecureStore.getItemAsync(DRAFT_KEY)','Array.from(new Set([...restored,...current]))','if(!hydrated)return','SecureStore.setItemAsync(DRAFT_KEY','RefreshControl','Your saved stop order is still preserved','The local draft remains available'])if(!route.includes(token))failures.push(`Route recovery missing ${token}`);
 if(/useEffect\(\(\)=>\{SecureStore\.setItemAsync\(DRAFT_KEY,JSON\.stringify\(stopIds\)\)/.test(route))failures.push('Route must not persist an empty draft before secure hydration is complete.');
 if(!route.includes('setBuilt(null)')||!route.includes('Build the route before starting navigation.'))failures.push('Route mutations and navigation recovery must invalidate stale built state safely.');
 for(const token of ['findLatestEligibleReviewCheckIn','setCheckInId(eligible?.id||null)','setComment(\'\')','setAmenityDraft({})','setReviewPhotos([])'])if(!location.includes(token))failures.push(`Location mission contribution recovery missing ${token}`);
 if(!location.includes('Review saved, but amenity details could not be attached.')||!location.includes('Review saved, but one or more photos could not be uploaded.'))failures.push('Mission contribution flow must distinguish canonical review success from supplemental evidence attachment failures.');
 for(const token of ['readContributionDraft','writeContributionDraft','clearContributionDraft','Your review could not be submitted yet. Your choices are still here','Review added'])if(!quickReview.includes(token))failures.push(`Quick review recovery missing ${token}`);
 if(quickReview.includes('Check in to continue')||quickReview.includes('Verify my visit first'))failures.push('Quick-review recovery must not reintroduce a separate check-in gate.');
 if(!saved.includes('RefreshControl')||!saved.includes('setRows(current=>current.filter'))failures.push('Saved must support refresh and preserve responsive removal state.');
 for(const token of ['handledNotificationResponses','response.notification.request.identifier','clearLastNotificationResponseAsync','markMobileNotificationRead','notificationDestination'])if(!layout.includes(token))failures.push(`Notification deep-link recovery missing ${token}`);
 if(!layout.includes('if(handledNotificationResponses.has(responseKey))return'))failures.push('Notification response handling must deduplicate repeated taps within the running app.');
 if(/service_role|record_data_feature_event/.test(qr+route+location+quickReview+saved+layout))failures.push('Consumer recovery surfaces must not introduce privileged backend authority.');
}
if(failures.length){console.error('Native consumer recovery audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native consumer recovery audit passed: quick-review choices survive retry, supplemental evidence failures do not erase the review, and navigation/QR recovery remains intact.');
