import fs from 'node:fs';

const source=fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8');
const required=[
  'OVERALL · REQUIRED',
  'CLEANLINESS · REQUIRED',
  'ANYTHING THE NEXT PERSON SHOULD KNOW? · OPTIONAL',
  'RATING_CHOICES',
  'CLEANLINESS_CHOICES',
  "{score:0,label:'Unusable'}",
  "{score:25,label:'Needs work'}",
  "{score:50,label:'Average'}",
  "{score:75,label:'Clean'}",
  "{score:100,label:'Spotless'}",
  'reviewScoresValid',
  'cleanlinessNumber>=0&&cleanlinessNumber<=100',
  'cleanlinessPct:cleanValue',
  'setCleanliness(String(choice.score))',
  'EXACT SCORE · 0–100',
  'accessibilityLabel="Exact cleanliness score out of 100"',
  'keyboardType="number-pad"',
  'value={cleanliness}',
  "onChangeText={value=>setCleanliness(value.replace(/[^0-9]/g,'').slice(0,3))}",
  'Enter any whole number, like 83 or 91.',
  'accessibilityState={{selected}}',
  'accessibilityLabel={`',
  '!reviewScoresValid',
  'Cleanliness is required and must be a whole number from 0 to 100.'
];
for(const token of required)if(!source.includes(token))throw new Error(`Consumer review score UX missing ${token}`);

for(const forbidden of [
  'onChangeText={setStars}',
  'placeholder="1–5 stars"',
  'value={cleanliness} onChangeText={updateCleanliness}',
  'placeholder="0–100"',
  "cleanliness===''?null:Number(cleanliness)"
])if(source.includes(forbidden))throw new Error(`Consumer review score UX still exposes obsolete free-form contract: ${forbidden}`);

console.log('Native review score input audit passed: overall and cleanliness retain accessible quick choices, and cleanliness also accepts exact whole-number input from 0 to 100.');
