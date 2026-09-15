import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const need=(label,path,tokens)=>{
  const source=read(path);
  for(const token of tokens)if(!source.includes(token))failures.push(label+' missing '+token+' in '+path);
};
const rgb=hex=>{
  const h=hex.replace('#','');
  return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
};
const luminance=hex=>{
  const [r,g,b]=rgb(hex).map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*r+0.7152*g+0.0722*b;
};
const contrast=(a,b)=>{
  const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (hi+0.05)/(lo+0.05);
};
const assertRatio=(label,a,b,min)=>{
  const ratio=contrast(a,b);
  if(ratio<min)failures.push(label+' contrast '+ratio.toFixed(2)+' is below '+min.toFixed(2)+' ('+a+' on '+b+')');
};

const theme=read('packages/mobile-core/src/theme.ts');
const fixed=[...theme.matchAll(/canvas:'(#[0-9a-fA-F]{6})',surface:'(#[0-9a-fA-F]{6})',surfaceRaised:'(#[0-9a-fA-F]{6})',ink:'(#[0-9a-fA-F]{6})',muted:'(#[0-9a-fA-F]{6})',line:'(#[0-9a-fA-F]{6})'/g)]
  .map(m=>({canvas:m[1],surface:m[2],raised:m[3],ink:m[4],muted:m[5],line:m[6]}));
if(fixed.length<2)failures.push('Could not parse Early Access and Dark theme palettes.');
else{
  for(const [label,p] of [['Early Access',fixed[0]],['Dark',fixed[1]]]){
    assertRatio(label+' primary text',p.ink,p.surface,7);
    assertRatio(label+' secondary text',p.muted,p.surface,4.5);
    assertRatio(label+' raised primary text',p.ink,p.raised,7);
    assertRatio(label+' raised secondary text',p.muted,p.raised,4.5);
    assertRatio(label+' card-to-canvas separation',p.surface,p.canvas,1.08);
    assertRatio(label+' raised-card separation',p.raised,p.surface,1.15);
    assertRatio(label+' card border separation',p.line,p.surface,1.5);
  }
}
const light=theme.match(/canvas:branded\?'(#[0-9a-fA-F]{6})':'(#[0-9a-fA-F]{6})',surface:'(#[0-9a-fA-F]{6})',surfaceRaised:branded\?'(#[0-9a-fA-F]{6})':'(#[0-9a-fA-F]{6})',ink:'(#[0-9a-fA-F]{6})',muted:'(#[0-9a-fA-F]{6})',line:'(#[0-9a-fA-F]{6})'/);
if(!light)failures.push('Could not parse Default/Light theme palettes.');
else{
  const [,defaultCanvas,lightCanvas,surface,defaultRaised,lightRaised,ink,muted,line]=light;
  for(const [label,canvas,raised] of [['Default',defaultCanvas,defaultRaised],['Light',lightCanvas,lightRaised]]){
    assertRatio(label+' primary text',ink,surface,7);
    assertRatio(label+' secondary text',muted,surface,4.5);
    assertRatio(label+' raised secondary text',muted,raised,4.5);
    assertRatio(label+' card-to-canvas separation',surface,canvas,1.05);
    assertRatio(label+' raised-card separation',raised,surface,1.10);
    assertRatio(label+' card border separation',line,surface,1.5);
  }
}

need('Shared Consumer cards','apps/consumer-mobile/components/ConsumerUI.tsx',[
  'backgroundColor:theme.surface,borderColor:theme.line',
  'backgroundColor:theme.surfaceRaised,borderColor:theme.line',
  'TrustStrip',
]);
need('Home relevance carousel','apps/consumer-mobile/components/RelevanceHeroCarousel.tsx',[
  'style={[s.cta,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'backgroundColor:i===index?theme.accent:theme.line',
  'useConsumerTheme()',
]);
need('Sponsored cards','apps/consumer-mobile/components/SponsoredSlot.tsx',[
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.cta,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}',
  'style={[s.note,{color:theme.muted}]}',
]);
need('Profile nested cards','apps/consumer-mobile/app/profile.tsx',[
  'style={[s.accountControl,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.dangerLink,{backgroundColor:theme.surfaceRaised,borderColor:theme.danger,borderWidth:1}]}',
]);
need('Progress nested cards','apps/consumer-mobile/app/progress.tsx',[
  'style={[s.trustCard,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,borderWidth:1}]}',
  'style={[s.chapterCard,{backgroundColor:theme.surface,borderColor:theme.line}',
  'style={[s.badge,{backgroundColor:theme.surface,borderColor:theme.line}',
  "useConsumerTheme('progress')",
]);
need('Community nested cards','apps/consumer-mobile/app/social.tsx',[
  'style={[s.feedLocation,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,borderWidth:1}]}',
  'style={[s.evidenceBox,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}',
  "useConsumerTheme('community')",
]);
need('Route nested cards','apps/consumer-mobile/app/route.tsx',[
  'style={[s.trustGuide,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}',
]);
need('Explore nested cards','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',[
  'style={[s.routeCoverage,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.amenityMatchPill,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}',
  'style={[s.locate,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]}',
]);
need('Location nested cards','apps/consumer-mobile/app/location/[id].tsx',[
  'style={[s.verifyAction,{backgroundColor:checkInId?theme.accentSoft:theme.surface,borderColor:theme.line,borderWidth:1}',
  'style={[s.missionBanner,{backgroundColor:missionMatches?theme.accentSoft:theme.surfaceRaised',
]);
need('Secondary Consumer cards','apps/consumer-mobile/app/messages.tsx',[
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.smallButton,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,borderWidth:1}]}',
]);
need('Notification hero controls','apps/consumer-mobile/app/notifications.tsx',[
  'style={[s.heroPrimary,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]}',
]);
need('Legacy play cards','apps/consumer-mobile/app/play.tsx',[
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
]);
need('Preferences notice','apps/consumer-mobile/app/preferences.tsx',[
  'style={[s.notice,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}',
]);

if(failures.length){
  console.error('Consumer card/theme contrast audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Consumer card/theme contrast audit passed.');
