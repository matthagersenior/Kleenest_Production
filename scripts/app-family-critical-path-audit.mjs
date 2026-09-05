import fs from 'node:fs';

const failures=[];
const exists=path=>fs.existsSync(path);
const read=path=>exists(path)?fs.readFileSync(path,'utf8'):'';
const requireFile=(path,label)=>{if(!exists(path))failures.push(`${label}: missing ${path}`);};
const requireTokens=(path,label,tokens)=>{const source=read(path);for(const token of tokens)if(!source.includes(token))failures.push(`${label}: missing ${token} in ${path}`);};

// Consumer: a verified contribution must stay device-location/check-in gated and refresh authoritative state.
const consumerLocation='apps/consumer-mobile/app/location/[id].tsx';
requireFile(consumerLocation,'consumer');
requireTokens(consumerLocation,'consumer',['findLatestEligibleReviewCheckIn','Location.Accuracy.High','mobileCheckIn','createMobileReview','await refresh()','setAmenityRefresh','setPhotoRefresh']);
if(exists(consumerLocation)&&!/if\(submitting\|\|!checkInId(?:\|\|[^)]*)?\)return/.test(read(consumerLocation)))failures.push('consumer: verified review submission is not gated by an eligible check-in');

// Business: QR Studio must protect scan quality while supporting branded, versioned designs.
const qr='apps/business-mobile/app/qr-studio.tsx';
const qrBranding='apps/business-mobile/services/qrBranding.ts';
requireFile(qr,'business');
requireFile(qrBranding,'business');
requireTokens(qr,'business',['Scan readiness','contrastRatio','quietZone','logoScale','pickAndUploadQrBranding','Save versioned design','Save current design as template']);
requireTokens(qrBranding,'business',["storage.from('qr-branding')",'2_097_152','image/png','image/jpeg','image/webp','requestMediaLibraryPermissionsAsync']);
// Business trust operations must preserve proof-sensitive remediation and the reverification QR handoff.
requireTokens('apps/business-mobile/services/product.ts','business',['business_create_reverification_qr']);
requireTokens('apps/business-mobile/app/operations.tsx','business',['proofMediaId','criticalProofRequired','Create reverification QR',"run('release')"]);

// Fleet: managers must see the whole dispatch workspace; field execution must remain geofence + offline capable.
requireTokens('apps/fleet-mobile/services/product.ts','fleet',['fleet_manager_dispatch']);
requireTokens('apps/fleet-mobile/app/planner.tsx','fleet',["['5 mi',8047]",'fleet_map_planner','setRouteStops']);
requireTokens('apps/fleet-mobile/app/execution.tsx','fleet',['getFleetRouteGeofenceManifest','recordFleetGeofenceEvent','recordOrQueueRouteStopTiming','replayOfflineRouteEvents','Location.watchPositionAsync']);
requireTokens('supabase/migrations/20260905191032_add_manager_fleet_dispatch_overview.sql','fleet',['fleet_actor_is_manager','fleet_manager_dispatch','grant execute']);

// Owner: KleenestOS must lead with actionable health/attention, not a flat route list or raw data dump.
const ownerOs='apps/platform-mobile/components/KleenestOS.tsx';
const ownerHome='apps/platform-mobile/app/index.tsx';
requireFile(ownerOs,'owner');
requireTokens(ownerOs,'owner',['OSHero','HealthCard','StatusPill','SectionHeader','DiagnosticDisclosure']);
requireTokens(ownerHome,'owner',['OSHero','HealthCard','Needs attention','ECONOMY PULSE','People & Access','Businesses & Network','Trust & Moderation','Operations']);
if(exists(ownerHome)&&read(ownerHome).includes('JSON.stringify('))failures.push('owner: Command Center must not render raw JSON as primary UX');

if(failures.length){console.error('App family critical path audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log('App family critical paths verified for Consumer, Business, Fleet, and Owner.');
