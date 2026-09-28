import fs from 'node:fs';

const source=fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8');
const failures=[];
for(const token of [
  "import AsyncStorage from '@react-native-async-storage/async-storage'",
  "const PROGRESSION_SECTIONS_KEY='kleenest.progression.sections.v1'",
  'function ProgressSection',
  'accessibilityState={{expanded:open}}',
  'Up next',
  'Missions & opportunities',
  'Season & community',
  'Rewards & achievements',
  'Rankings & history',
  'AsyncStorage.setItem(PROGRESSION_SECTIONS_KEY'
])if(!source.includes(token))failures.push(`Missing compact progression contract: ${token}`);

if(failures.length){
 console.error('Progression compact groups audit failed:');
 failures.forEach(failure=>console.error('- '+failure));
 process.exit(1);
}
console.log('Progression compact groups audit passed.');
