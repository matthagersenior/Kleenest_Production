import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const progress=read('apps/consumer-mobile/app/progress.tsx');
const layout=read('apps/consumer-mobile/app/_layout.tsx');
const beta=read('apps/consumer-mobile/components/BetaReportButton.tsx');

for(const token of ['seasonIdentity:{flex:1,minWidth:0}',"seasonTitle:{fontSize:28,lineHeight:31,fontWeight:'900',color:'#fff',marginTop:3,flexShrink:1}"]){
  if(!progress.includes(token))failures.push('Progress mobile overflow guard missing '+token);
}
for(const token of ['const tabLabel=',"tabBarItemStyle:{minWidth:0,paddingHorizontal:0,paddingVertical:1}","tabBarLabel:tabLabel('Explore')","tabBarLabel:tabLabel('Games')","tabIcon('games',theme.accentSoft)"]){
  if(!layout.includes(token))failures.push('Bottom navigation polish missing '+token);
}
for(const token of [
  'accessibilityLabel="Tell Kleenest what you think"',
  '✦ Tell Kleenest</Text>',
  "right:14,bottom:78",
  "borderRadius:999",
  "paddingHorizontal:13,paddingVertical:10",
  "fabText:{fontSize:11"
]){
  if(!beta.includes(token))failures.push('Beta feedback labeled-pill contract missing '+token);
}
if(beta.includes("width:46,height:46")||beta.includes('}>✦</Text>'))failures.push('Beta feedback regressed to the icon-only control; keep the labeled Tell Kleenest pill during beta.');

if(failures.length){
  console.error('Progress mobile polish audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Progress mobile polish audit passed.');
