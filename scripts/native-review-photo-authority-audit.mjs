import fs from 'node:fs';

const required=[
  'apps/consumer-mobile/services/reviewPhotos.ts',
  'apps/consumer-mobile/services/reviewEvidence.ts',
  'apps/consumer-mobile/components/ReviewPhotoStrip.tsx',
  'apps/consumer-mobile/app/location/[id].tsx',
  'supabase/migrations/20260831014000_mobile_review_photo_attachment.sql',
  'supabase/migrations/20260831050000_mobile_review_evidence_provenance.sql',
];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing native review evidence authority file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const evidenceService=fs.readFileSync(required[1],'utf8');
  const strip=fs.readFileSync(required[2],'utf8');
  const location=fs.readFileSync(required[3],'utf8');
  const migration=fs.readFileSync(required[4],'utf8');
  const evidenceMigration=fs.readFileSync(required[5],'utf8');
  if(!service.includes("storage.from('review-photos').upload")||!service.includes('`${user.id}/${reviewId}/')) failures.push('Review photo uploads must use the canonical review-photos bucket and a signed-in user folder.');
  if(!service.includes("rpc('attach_review_photo'")) failures.push('Uploaded review photos must attach through the protected RPC authority.');
  if(/\.from\(['"]review_photos['"]\)\.insert/.test(service+location)) failures.push('Mobile review photos must never insert directly into review_photos.');
  if(!service.includes('MAX_REVIEW_PHOTOS = 3')||!service.includes('MAX_REVIEW_PHOTO_BYTES')) failures.push('Review photo client must enforce count and size bounds.');
  if(!strip.includes('listReviewPhotos')||!strip.includes('public_url')) failures.push('Published community reviews must render canonical review photo records.');
  if(!location.includes('chooseReviewPhotos')||!location.includes('uploadReviewPhotos')||!location.includes('ReviewPhotoStrip')) failures.push('Verified review UI must select, upload, and display photo evidence.');
  const reviewCreate=location.indexOf('createMobileReview');
  const photoUpload=location.indexOf('uploadReviewPhotos(reviewId',reviewCreate);
  if(reviewCreate<0||photoUpload<reviewCreate) failures.push('Review photos must upload only after the canonical review exists.');
  if(!location.includes('Review saved, but one or more photos could not be uploaded.')) failures.push('Photo attachment failure must not falsely report that the already-saved review failed.');
  for(const token of ['security definer',"r.user_id=v_uid","r.status='published'","storage.objects","bucket_id='review-photos'","o.owner_id=v_uid::text","revoke all on function public.attach_review_photo","grant execute on function public.attach_review_photo"]){if(!migration.toLowerCase().includes(token.toLowerCase()))failures.push(`Review photo migration missing protected authority token: ${token}`);}

  if(!evidenceService.includes("rpc('mobile_review_evidence'")||!evidenceService.includes('verified_checked_in_at')||!evidenceService.includes('photo_evidence_count')||!evidenceService.includes('amenity_evidence_count')) failures.push('Mobile review evidence service must consume canonical provenance fields.');
  if(!strip.includes('getReviewEvidence')||!strip.includes('VERIFIED VISIT')||!strip.includes('visitFreshness')||!strip.includes('photo_evidence_count')||!strip.includes('amenity_evidence_count')||!strip.includes("amenit${")) failures.push('Review cards must surface verified visit freshness and evidence counts.');
  for(const token of ["set search_path = ''",'public.mobile_review_evidence','public.mobile_location_review_evidence','public.review_photos','public.location_amenity_observations','ci.user_id = r.user_id','ci.location_id = r.location_id',"r.status = 'published'",'verified_checked_in_at','verified_check_in_method','verified_distance_meters','photo_evidence_count','amenity_evidence_count']) if(!evidenceMigration.includes(token)) failures.push(`Review evidence migration missing provenance authority token: ${token}`);
  if(!evidenceMigration.includes('revoke all on function public.mobile_review_evidence(uuid) from public;')||!evidenceMigration.includes('grant execute on function public.mobile_review_evidence(uuid) to anon, authenticated;')) failures.push('Per-review evidence authority must be public-safe but explicitly granted.');
}
if(failures.length){console.error('Native review evidence authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native review evidence authority audit passed.');
