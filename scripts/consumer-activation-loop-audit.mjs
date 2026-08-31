import fs from 'node:fs';

const failures=[];
const files={
  home:'apps/consumer-mobile/app/index.tsx',
  explore:'apps/consumer-mobile/app/explore.tsx',
  location:'apps/consumer-mobile/app/location/[id].tsx',
  social:'apps/consumer-mobile/app/social.tsx',
  play:'apps/consumer-mobile/app/play.tsx',
  activity:'apps/consumer-mobile/app/activity.tsx',
  core:'packages/mobile-core/src/index.ts',
  amenities:'apps/consumer-mobile/services/amenities.ts',
  photos:'apps/consumer-mobile/services/reviewPhotos.ts',
  community:'apps/consumer-mobile/services/communityActivity.ts'
};
for(const [name,file] of Object.entries(files))if(!fs.existsSync(file))failures.push(`Missing ${name} activation file: ${file}`);
if(!failures.length){
 const read=file=>fs.readFileSync(file,'utf8');
 const home=read(files.home),explore=read(files.explore),location=read(files.location),social=read(files.social),play=read(files.play),activity=read(files.activity),core=read(files.core),amenities=read(files.amenities),photos=read(files.photos),community=read(files.community);

 for(const token of ['Find a bathroom. Fast.','Show nearby restrooms','Kleenest gets smarter from real visits.'])if(!home.includes(token))failures.push(`Home activation hierarchy missing ${token}.`);
 for(const token of ['listNearbyRestrooms','listAmenityCatalog','selectedAmenityNames','Details','Directions',"pathname:'/route'",'readNearbyCache','writeNearbyCache'])if(!explore.includes(token))failures.push(`Discovery activation missing ${token}.`);
 for(const token of ['mobileCheckIn','findLatestEligibleReviewCheckIn','createMobileReview','recordReviewAmenityInventory','chooseReviewPhotos','uploadReviewPhotos','getMobileProgressionDashboard','listMobileActiveQuests','rewardMessage','toggleMobileFavorite'])if(!location.includes(token))failures.push(`Location contribution loop missing ${token}.`);
 if(!location.includes("permission.status!=='granted'")||!location.includes('Location.Accuracy.High'))failures.push('Verified check-in must remain bound to explicit high-accuracy device location.');
 if(!location.includes('if(submitting||!checkInId)return'))failures.push('Review submission must remain gated by an eligible check-in.');
 if(!location.includes('await refresh()')||!location.includes('setAmenityRefresh')||!location.includes('setPhotoRefresh'))failures.push('Successful contribution must refresh authoritative read models.');
 if(!location.includes('before=await progressionSnapshot()')||!location.includes('after=await progressionSnapshot()'))failures.push('Consumer contributions must surface server-derived progression changes rather than client-fabricated rewards.');

 for(const token of ["rpc('kleenest_map_check_in'","rpc('create_review'",'getMobileProgressionDashboard','listMobileActiveQuests','listMobileCommunityActivity'])if(!core.includes(token)&&!community.includes(token))failures.push(`Canonical mobile activation authority missing ${token}.`);
 if(!amenities.includes("rpc('record_review_amenity_inventory'")||!amenities.includes('progression'))failures.push('Amenity evidence must use the server authority that also returns progression context.');
 if(!photos.includes('review-photos'))failures.push('Review photo evidence must use the canonical review-photo storage boundary.');

 for(const token of ['COMMUNITY','People helping people.','Community pulse','VERIFIED VISIT','reputation'])if(!social.includes(token))failures.push(`Community activation missing ${token}.`);
 if(!social.includes('listMobileCommunityActivity')||!social.includes('toggleMobileFollow'))failures.push('Community must consume canonical published activity and relationship authority.');
 for(const token of ['Active trust mission','badges','quest','leaderboard'])if(!play.toLowerCase().includes(token.toLowerCase()))failures.push(`Progression surface missing ${token}.`);
 if(!activity.includes('TRUST MISSION')||!activity.includes('View strengthened restroom'))failures.push('Personal activity must connect completed evidence missions back to the strengthened restroom.');

 const screens=[explore,location,social,play,activity].join('\n');
 if(/\.rpc\(\s*['"](?:business_|fleet_|enterprise_|admin_)/i.test(screens))failures.push('Core consumer activation screens must not directly invoke Operations RPC namespaces.');
 if(/from\(\s*['"](?:businesses|business_members|fleet_|enterprise_|admin_)/i.test(screens))failures.push('Core consumer activation screens must not directly query Operations tables.');
}
if(failures.length){console.error('Consumer activation loop audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Consumer activation loop audit passed.');
