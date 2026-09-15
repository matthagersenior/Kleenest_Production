import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const progress=read('apps/consumer-mobile/app/progress.tsx');
const layout=read('apps/consumer-mobile/app/_layout.tsx');
const beta=read('apps/consumer-mobile/components/BetaReportButton.tsx');

for(const token of ['seasonIdentity:{flex:1,minWidth:0}',"seasonTitle:{fontSize:28,lineHeight:31,fontWeight:'900',color:'#fff',marginTop:3,flexShrink:1}"]){
  if(!progress.includes(token))failures.push('Progress mobile overflow guard missing '+token);
}
for(const token of ['const tabLabel=',"tabBarItemStyle:{minWidth:0,paddingHorizontal:0}","tabBarLabel:tabLabel('Explore')","tabBarLabel:tabLabel('Community')"]){
  if(!layout.includes(token))failures.push('Bottom navigation polish missing '+token);
}
for(const token of ["width:46,height:46","<Text accessible={false} style={[s.fabText,{color:theme.accentText}]}>✦</Text>"]){
  if(!beta.includes(token))failures.push('Beta feedback mobile footprint missing '+token);
}
if(beta.includes('✦ Tell Kleenest</Text>'))failures.push('Beta feedback button regressed to the wide label that can overlap mobile content.');

if(failures.length){
  console.error('Progress mobile polish audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Progress mobile polish audit passed.');
