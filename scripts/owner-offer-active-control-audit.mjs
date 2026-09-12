import fs from 'node:fs';

const path='apps/platform-mobile/app/pilots.tsx';
if(!fs.existsSync(path)) throw new Error('Missing KleenestOS Offers & Pilots screen.');
const text=fs.readFileSync(path,'utf8');
for (const [needle,message] of [
  ['Offer active','Offers & Pilots must expose the whole-offer active control.'],
  ['value={o.active}','Offer active switch must reflect canonical offer state.'],
  ['{active:v}','Offer active switch must mutate canonical offer governance.'],
  ['patchOffer(o','Offer active mutation must use the audited owner governance wrapper.'],
]) if(!text.includes(needle)) throw new Error(message);
console.log('KleenestOS offer active-control audit passed.');
