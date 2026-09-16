import fs from 'node:fs';

const progress=fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8');

const heroIndex=progress.indexOf('<View style={[s.hero');
const actionsIndex=progress.indexOf('<View style={s.actions}>');
const toolkitIndex=progress.indexOf('<View style={s.rewardToolsRow}>');
const sponsoredIndex=progress.indexOf('<SponsoredSlot surface="progress"');
const leagueIndex=progress.indexOf('<View style={[s.leagueCard');

if(heroIndex<0||actionsIndex<0||toolkitIndex<0||sponsoredIndex<0||leagueIndex<0) throw new Error('Progress hero/action/toolkit/sponsor/league surfaces must all exist.');
if(!(heroIndex<actionsIndex&&actionsIndex<toolkitIndex&&toolkitIndex<sponsoredIndex&&sponsoredIndex<leagueIndex)){
  throw new Error('Progress Toolkit must own a dedicated row between the primary actions and the League card.');
}
if(!/hero:\{[^}]*overflow:'hidden'[^}]*\}/.test(progress)){
  throw new Error('Progress hero must clip itself instead of painting over following controls.');
}
if(!/actions:\{[^}]*position:'relative'[^}]*zIndex:[1-9][0-9]*[^}]*\}/.test(progress)){
  throw new Error('Progress actions must establish a foreground stacking context above the hero.');
}
if(!/rewardToolsRow:\{[^}]*width:'100%'[^}]*position:'relative'[^}]*zIndex:[1-9][0-9]*[^}]*\}/.test(progress)){
  throw new Error('Reward Toolkit must have its own full-width foreground row.');
}
if(!/rewardToolsButton:\{[^}]*width:'100%'[^}]*\}/.test(progress)){
  throw new Error('Reward Toolkit button must fill its dedicated row instead of wrapping into adjacent cards.');
}
console.log('progress hero/action separation contract passed');
