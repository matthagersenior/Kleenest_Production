import fs from 'node:fs';

const failures=[];
const files={
  home:'apps/consumer-mobile/app/index.tsx',
  explore:'apps/consumer-mobile/app/explore.tsx',
  adaptiveExplore:'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  discover:'apps/consumer-mobile/app/discover.tsx',
  progress:'apps/consumer-mobile/app/progress.tsx',
  location:'apps/consumer-mobile/app/location/[id].tsx',
  quickReview:'apps/consumer-mobile/app/review/[id].tsx',
  social:'apps/consumer-mobile/app/social.tsx',
  play:'apps/consumer-mobile/app/play.tsx',
  activity:'apps/consumer-mobile/app/activity.tsx',
  core:'packages/mobile-core/src/index.ts',
  amenities:'apps/consumer-mobile/services/amenities.ts',
  photos:'apps/consumer-mobile/services/reviewPhotos.ts',
  discoveryProgression:'apps/consumer-mobile/services/discoveryProgression.ts',
  community:'apps/consumer-mobile/services/communityActivity.ts',
  locationResolver:'apps/consumer-mobile/services/locationResolver.ts'
};
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`Missing ${name} activation file: ${file}`);
if(!failures.length){
 const read=file=>fs.readFileSync(file,'utf8');
 const home=read(files.home),explore=read(files.explore),adaptiveExplore=read(files.adaptiveExplore),discover=read(files.discover),progress=read(files.progress),location=read(files.location),quickReview=read(files.quickReview),social=read(files.social),play=read(files.play),activity=read(files.activity),core=read(files.core),amenities=read(files.amenities),photos=read(files.photos),discoveryProgression=read(files.discoveryProgression),community=read(files.community),locationResolver=read(files.locationResolver);
 const discoverySurface=`${explore}\n${adaptiveExplore}`;

 for(const token of ["'/explore'",'Find a bathroom','homePrimaryCta','REVIEW','A recent visit','QR PROOF','THE KLEENEST LOOP','XP + levels','Add a missing place','YOUR NETWORK'])if(!home.includes(token))failures.push(`Home activation hierarchy missing ${token}.`);
 if(home.includes('Scan QR to check in or review'))failures.push('Home activation hierarchy must keep regular check-in separate from QR proof.');
 for(const token of ['resolveConsumerSearchLocation','looksLikeAddressOrArea','searchAreaOrigin','searched-area-marker'])if(!adaptiveExplore.includes(token))failures.push(`Address-origin Explore activation missing ${token}.`);
 if(adaptiveExplore.includes('Location.geocodeAsync'))failures.push('Address-origin Explore must not regress to device geocoding.');
 if(!locationResolver.includes("functions.invoke('resolve-consumer-location'"))failures.push('Address-origin Explore activation must use the canonical server resolver.');
 for(const token of ['listAmenityCatalog','selectedAmenityNames','captureConsumerRouteIntent','readNearbyCache','writeNearbyCache','listLocationTrustSummaries'])if(!discoverySurface.includes(token))failures.push(`Discovery activation missing ${token}.`);
 if(!['findAdaptiveNearbyRestrooms','listNearbyRestrooms'].some(token=>discoverySurface.includes(token)))failures.push('Discovery activation missing nearby-restroom search authority.');
 if(!['directionsUrl','navigateUrl'].some(token=>discoverySurface.includes(token)))failures.push('Discovery activation missing directions-link authority.');
 if(!/pathname\s*:\s*['"]\/route['"]/.test(discoverySurface))failures.push('Discovery activation missing route navigation.');
 for(const token of ['remote','address','place_search','map_pin','gps','onsite_live','captureGPS','choosePhoto','saveDiscovery','saveEvidence'])if(!discover.includes(token))failures.push(`First-class place discovery missing ${token}.`);
 for(const token of ['consumer_match_or_create_discovery','consumer_record_discovery_evidence','consumer_progression_overview','consumer_active_objectives','consumer_progression_rankings','consumer_nearby_progression_opportunities','attach_discovery_photo'])if(!discoveryProgression.includes(token))failures.push(`Discovery/progression service missing ${token}.`);
 for(const token of ['SPECIALTY LEVELS','WHAT TO DO NEXT','BADGES','RANKINGS','XP HISTORY'])if(!progress.includes(token))failures.push(`Canonical Progress activation missing ${token}.`);
 for(const label of ['quest','mission','challenge','journey','campaign','contest'])if(!progress.includes(`'${label}'`))failures.push(`Canonical Progress missing ${label} objective family.`);

 for(const token of ['mobileCheckIn','findLatestEligibleReviewCheckIn','createMobileReview','recordReviewAmenityInventory','chooseReviewPhotos','uploadReviewPhotos','getMobileProgressionDashboard','listMobileActiveQuests','rewardMessage','toggleMobileFavorite'])if(!location.includes(token))failures.push(`Location mission/evidence compatibility missing ${token}.`);
 if(!location.includes("permission.status!=='granted'")||!location.includes('Location.Accuracy.High'))failures.push('Optional explicit check-in must remain bound to explicit high-accuracy device location.');
 if(!location.includes("router.push(`/review/${locationId}`)"))failures.push('Location detail must hand ordinary reviews to the quick-review journey.');
 for(const token of ['consumer_quick_review','Submit review','Dirty','Okay','Clean','Excellent','review_submit_attempt','review_submit_success'])if(!quickReview.includes(token))failures.push(`Quick-review activation missing ${token}.`);
 if(!quickReview.includes('findLatestEligibleReviewCheckIn')||!quickReview.includes('createMobileReview'))failures.push('Quick review must reuse an existing verified visit when one is already available.');
 if(!quickReview.includes("Location.Accuracy.High"))failures.push('Quick review must use an explicit current location when it needs to establish visit proof at submit time.');
 if(quickReview.includes('Check in to continue')||quickReview.includes('Verify my visit first'))failures.push('Quick review must not require a separate check-in/verification UX step.');
 if(!location.includes('await refresh()')||!location.includes('setAmenityRefresh')||!location.includes('setPhotoRefresh'))failures.push('Rich mission contributions must refresh authoritative read models.');
 if(!location.includes('before=await progressionSnapshot()')||!location.includes('after=await progressionSnapshot()'))failures.push('Mission contributions must surface server-derived progression changes rather than client-fabricated rewards.');

 for(const token of ["rpc('kleenest_map_check_in'","rpc('create_review'",'getMobileProgressionDashboard','listMobileActiveQuests','listMobileCommunityActivity'])if(!core.includes(token)&&!community.includes(token))failures.push(`Canonical mobile activation authority missing ${token}.`);
 if(!amenities.includes("rpc('record_review_amenity_inventory'")||!amenities.includes('progression'))failures.push('Amenity evidence must use the server authority that also returns progression context.');
 if(!photos.includes('review-photos'))failures.push('Review photo evidence must use the canonical review-photo storage boundary.');

 for(const token of ['COMMUNITY','People helping people find better bathrooms.','COMMUNITY PULSE','VERIFIED VISIT','reputation'])if(!social.includes(token))failures.push(`Community activation missing ${token}.`);
 if(!social.includes('listMobileCommunityActivity')||!social.includes('toggleMobileFollow'))failures.push('Community must consume canonical published activity and relationship authority.');
 for(const token of ['getMobileProgressionDashboard','listMobileActiveQuests','listMobileChallenges','listMobileContests','listMobileLeaderboard','ACTIVE TRUST MISSION'])if(!play.includes(token))failures.push(`Legacy progression compatibility surface missing ${token}.`);
 if(!activity.includes('TRUST MISSION')||!activity.includes('View strengthened restroom'))failures.push('Personal activity must connect completed evidence missions back to the strengthened restroom.');

 const screens=[discoverySurface,discover,progress,location,quickReview,social,play,activity].join('\n');
 if(/\.rpc\(\s*['"](?:business_|fleet_|enterprise_|admin_)/i.test(screens))failures.push('Core consumer activation screens must not directly invoke Operations RPC namespaces.');
 if(/from\(\s*['"](?:businesses|business_members|fleet_|enterprise_|admin_)/i.test(screens))failures.push('Core consumer activation screens must not directly query Operations tables.');
}
if(failures.length){console.error('Consumer activation loop audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer activation loop audit passed: native discovery opens quickly, review can establish/reuse visit proof without a separate check-in step, and richer mission evidence remains available.');
