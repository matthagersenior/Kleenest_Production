import fs from 'node:fs';

const failures=[];
const exists=path=>fs.existsSync(path);
const read=path=>exists(path)?fs.readFileSync(path,'utf8'):'';
const requireFile=(path,label)=>{if(!exists(path))failures.push(`${label}: missing ${path}`);};
const requireTokens=(path,label,tokens)=>{const source=read(path);for(const token of tokens)if(!source.includes(token))failures.push(`${label}: missing ${token} in ${path}`);};
const requireAny=(path,label,tokens)=>{const source=read(path);if(!tokens.some(token=>source.includes(token)))failures.push(`${label}: missing semantic control (${tokens.join(' | ')}) in ${path}`);};

// Consumer: a verified contribution must stay device-location/check-in gated and refresh authoritative state.
const consumerLocation='apps/consumer-mobile/app/location/[id].tsx';
requireFile(consumerLocation,'consumer');
requireTokens(consumerLocation,'consumer',['findLatestEligibleReviewCheckIn','Location.Accuracy.High','mobileCheckIn','createMobileReview','await refresh()','setAmenityRefresh','setPhotoRefresh']);
if(exists(consumerLocation)&&!/if\(submitting\|\|!checkInId(?:\|\|[^)]*)?\)return/.test(read(consumerLocation)))failures.push('consumer: verified review submission is not gated by an eligible check-in');

// Google OAuth: all role apps must use Supabase OAuth and return through their own registered deep link.
requireTokens('apps/consumer-mobile/app/profile.tsx','consumer oauth',["provider:'google'",'mobileAuthRedirect','handleAuthUrl','exchangeCodeForSession','Continue with Google']);
requireTokens('apps/business-mobile/app/account.tsx','business oauth',["import * as Linking from 'expo-linking'","scheme:'kleenest-business'","provider:'google'",'handleAuthUrl','exchangeCodeForSession','Continue with Google']);
requireTokens('apps/fleet-mobile/app/account.tsx','fleet oauth',["import * as Linking from 'expo-linking'","scheme:'kleenest-fleet'","provider:'google'",'handleAuthUrl','exchangeCodeForSession','Continue with Google']);
requireTokens('apps/platform-mobile/app/account.tsx','owner oauth',["import * as Linking from 'expo-linking'","scheme:'kleenest-owner'","provider:'google'",'handleAuthUrl','exchangeCodeForSession','Continue with Google','getOwnerAuthorization','a.authorized',"signOut({scope:'local'})"]);

// Business: canonical QR Studio must protect scan quality and preserve versioned workflow behavior.
const qr='apps/business-mobile/app/qr-studio.tsx';
const qrService='apps/business-mobile/services/qrStudio.ts';
const qrBranding='apps/business-mobile/services/qrBranding.ts';
requireFile(qr,'business');requireFile(qrService,'business');requireFile(qrBranding,'business');
requireTokens(qr,'business',['Scan readiness','contrastRatio','quietZone','logoScale','pickAndUploadQrBranding','Save current design as template','Create engagement program','Share QR']);
requireAny(qr,'business',['Save configuration','Save versioned design']);
requireTokens(qrService,'business',['qr_studio_upsert_asset','qr_studio_versions','qr_studio_restore_version','create_qr_engagement_program','business_set_qr_active','business_delete_qr']);
requireTokens(qrBranding,'business',["storage.from('qr-branding')",'2_097_152','image/png','image/jpeg','image/webp','requestMediaLibraryPermissionsAsync']);
// Business trust operations must preserve proof-sensitive remediation and the reverification QR handoff.
requireTokens('apps/business-mobile/services/trustOperations.ts','business',['business_create_reverification_qr']);
requireTokens('apps/business-mobile/services/remediationProof.ts','business',['business_create_media',"storage.from(BUCKET).upload",'requestMediaLibraryPermissionsAsync']);
requireTokens('apps/business-mobile/app/operations.tsx','business',['proofMediaId','criticalProofRequired','Create reverification QR',"run('release')"]);

// Fleet: managers must see the whole dispatch workspace; field execution must remain geofence + durable offline capable.
requireTokens('apps/fleet-mobile/services/product.ts','fleet',['fleet_manager_dispatch']);
requireTokens('apps/fleet-mobile/app/planner.tsx','fleet',["['5 mi',8047]",'fleet_map_planner','setRouteStops']);
requireTokens('apps/fleet-mobile/app/execution.tsx','fleet',['getFleetRouteGeofenceManifest','recordFleetGeofenceEvent','recordOrQueueRouteStopTiming','replayOfflineRouteEvents','Location.watchPositionAsync']);
requireTokens('apps/fleet-mobile/services/offline.ts','fleet',["rpc('create_offline_pack'",'p_client_event_id:row.id','already_synced','AsyncStorage.setItem(KEY']);
requireTokens('supabase/migrations/20260905191032_add_manager_fleet_dispatch_overview.sql','fleet',['fleet_actor_is_manager','fleet_manager_dispatch','grant execute']);

// Owner: KleenestOS must lead with actionable health and expose actual operating control planes.
const ownerOs='apps/platform-mobile/components/KleenestOS.tsx';
const ownerHome='apps/platform-mobile/app/index.tsx';
requireFile(ownerOs,'owner');
requireTokens(ownerOs,'owner',['OSHero','HealthCard','StatusPill','SectionHeader','DiagnosticDisclosure']);
requireTokens(ownerHome,'owner',['OSHero','HealthCard','Needs attention','ECONOMY PULSE','People & Access','Businesses & Network','Trust & Moderation','Operations']);
requireTokens('apps/platform-mobile/app/businesses.tsx','owner',['Fleet enabled','Enterprise enabled','Add member','Remove member']);
requireTokens('apps/platform-mobile/app/progression.tsx','owner',['Economy & Progression Studio','Create objective','Edit XP','Refresh progression supply']);
requireTokens('apps/platform-mobile/app/data.tsx','owner',['Create record','Edit record','Delete record','PROTECTED']);
if(exists(ownerHome)&&read(ownerHome).includes('JSON.stringify('))failures.push('owner: Command Center must not render raw JSON as primary UX');

if(failures.length){console.error('App family critical path audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log('App family critical paths verified for Consumer, Business, Fleet, and Owner with canonical versioning, offline recovery and operator controls.');
await import('./owner-runtime-integrity-audit.mjs');
