import fs from 'node:fs';

const arena=fs.readFileSync('apps/consumer-mobile/app/game/[code].tsx','utf8');

if(arena.includes('accessibilityLabel="Back to Arcade" onPress={()=>router.back()}')){
  throw new Error('Arcade back action must not depend on navigation history.');
}
const explicit=(arena.match(/accessibilityLabel="Back to Arcade"[\s\S]{0,220}?router\.replace\('\/games'\)/g)||[]).length;
if(explicit<2){
  throw new Error('Every Back to Arcade control must deterministically replace the arena with /games.');
}
console.log('arcade back-route contract passed');
