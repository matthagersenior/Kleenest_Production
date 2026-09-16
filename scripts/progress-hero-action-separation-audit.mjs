import fs from 'node:fs';

const progress=fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8');

const heroIndex=progress.indexOf('<View style={[s.hero');
const actionsIndex=progress.indexOf('<View style={s.actions}>');
const sponsoredIndex=progress.indexOf('<SponsoredSlot surface="progress"');

if(heroIndex<0||actionsIndex<0||sponsoredIndex<0) throw new Error('Progress hero/action/sponsor surfaces must all exist.');
if(!(heroIndex<actionsIndex&&actionsIndex<sponsoredIndex)){
  throw new Error('Core Progress actions must render immediately after the hero and before sponsored placement.');
}
if(!/hero:\{[^}]*overflow:'hidden'[^}]*\}/.test(progress)){
  throw new Error('Progress hero must clip itself instead of painting over following controls.');
}
if(!/actions:\{[^}]*position:'relative'[^}]*zIndex:[1-9][0-9]*[^}]*\}/.test(progress)){
  throw new Error('Progress actions must establish a foreground stacking context above the hero.');
}
console.log('progress hero/action separation contract passed');
