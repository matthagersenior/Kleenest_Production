import fs from 'node:fs';

const source=fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8');
const required=[
  'RATING · REQUIRED',
  '1 = poor · 3 = good · 5 = excellent.',
  'CLEANLINESS · REQUIRED',
  '0 = very dirty or unusable · 50 = average · 100 = spotless.',
  'WHAT SHOULD THE NEXT PERSON KNOW? · OPTIONAL',
  'RATING_CHOICES',
  'reviewScoresValid',
  'updateCleanliness',
  'maxLength={3}',
  'inputMode="numeric"',
  'accessibilityState={{selected}}',
  'accessibilityLabel={`',
  '!reviewScoresValid',
  'Cleanliness is required and must be a whole number from 0 to 100.'
];
for(const token of required)if(!source.includes(token))throw new Error(`Consumer review score UX missing ${token}`);
for(const forbidden of ['onChangeText={setStars}','placeholder="1–5 stars"','cleanliness===\'\'?null:Number(cleanliness)'])if(source.includes(forbidden))throw new Error(`Consumer review score UX still exposes obsolete free-form contract: ${forbidden}`);
console.log('Native review score input audit passed.');
