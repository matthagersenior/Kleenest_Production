import fs from 'node:fs';

const path='apps/consumer-mobile/app/location/[id].tsx';
const src=fs.readFileSync(path,'utf8');
const required=[
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
];
let failed=false;
for(const token of required){
  if(!src.includes(token)){console.error('FAIL missing',token);failed=true;}
  else console.log('PASS',token);
}
if(src.includes("OPTIONAL EVIDENCE</Text><Text style={[s.blockTitle")) {
  console.error('FAIL legacy collapsed photo+amenity evidence label still present');
  failed=true;
}
if(failed) process.exit(1);
console.log('Review photo friction contract satisfied.');
