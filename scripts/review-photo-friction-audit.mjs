import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const location=read('apps/consumer-mobile/app/location/[id].tsx');
const service=read('apps/consumer-mobile/services/priorKnowledge.ts');
const migration=read('supabase/migrations/20260915215300_consumer_prior_visit_photo_evidence.sql');

for(const token of [
  'PHOTO · OPTIONAL',
  'Add a photo now—or later',
  'Choose from phone',
  'Done — add photo later',
  'MORE OPTIONAL DETAIL',
  'Add amenities you noticed',
  "hasOptionalEvidence:Boolean(reviewPhotos.length||selectedAmenities.length)",
  'photoLaterHint',
  'photoFastPath',
  'ADD PHOTOS FROM A PREVIOUS VISIT',
  'photoFirstMode',
  'reviewPhotoCount',
  'ADD PREVIOUS-VISIT PHOTOS',
  'Add selected photos as previous-visit evidence',
  'submitPriorKnowledgePhotos',
  'previousVisitPhotoRecency',
  'reviewPhotos.length>0&&!checkInId',
])if(!location.includes(token))failures.push('Location review flow missing '+token);

if(location.includes("OPTIONAL EVIDENCE</Text><Text style={[s.blockTitle")){
  failures.push('Legacy collapsed photo+amenity evidence label still present.');
}
if(location.includes("!checkInId?'Verify visit to continue'")){
  failures.push('Previous-visit photo flow must not end in the old giant disabled Verify visit button.');
}

for(const token of [
  'submitPriorKnowledgePhotos',
  "storage.from('discovery-photos').upload",
  "rpc('consumer_attach_prior_knowledge_photos'",
  "storage.from('discovery-photos').remove",
])if(!service.includes(token))failures.push('Previous-visit photo service missing '+token);

for(const token of [
  'consumer_attach_prior_knowledge_photos',
  "'evidence_class','prior_visit_photo'",
  "'presence_verified',false",
  "'visit_verified',false",
  "'freshness_eligible',false",
  "'consumer_prior_photo'",
  "record_progression_event_v2",
  "'prior_knowledge'",
  "revoke all on function public.consumer_attach_prior_knowledge_photos",
])if(!migration.includes(token))failures.push('Previous-visit photo authority missing '+token);

if(failures.length){
  console.error('Review photo friction audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Review photo friction contract satisfied: photos can be chosen now, deferred after a review, or submitted as historical evidence without claiming current presence.');
