import fs from 'node:fs';

const path='apps/platform-mobile/app/pilots.tsx';
if(!fs.existsSync(path))throw new Error('Missing KleenestOS Offers & Pilots screen.');
const text=fs.readFileSync(path,'utf8');
const required=[
  ["Linking",'Offers & Pilots must use React Native Linking for sample launch.'],
  ["Open sample",'Every offer control surface must expose an Open sample action.'],
  ["kleenest://",'Consumer sample deep-link scheme is required.'],
  ["kleenest-business://",'Business sample deep-link scheme is required.'],
  ["kleenest-fleet://",'Fleet sample deep-link scheme is required.'],
  ["developer_portal",'Developer Platform sample must support the live portal target.'],
  ["sample_ready",'Sample launch must respect canonical readiness.'],
  ["sample_enabled",'Sample launch must respect owner governance.'],
];
for(const [needle,message] of required)if(!text.includes(needle))throw new Error(message);
console.log('KleenestOS offer sample-launch audit passed.');
