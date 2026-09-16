import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const index=read('packages/mobile-core/src/appSearch.ts');

const apps={
  consumer:'apps/consumer-mobile/app/_layout.tsx',
  business:'apps/business-mobile/app/_layout.tsx',
  fleet:'apps/fleet-mobile/app/_layout.tsx',
  owner:'apps/platform-mobile/app/_layout.tsx',
};

const failures=[];
for(const [scope,layoutPath] of Object.entries(apps)){
  const layout=read(layoutPath);
  if(!layout.includes('name="search"'))failures.push(`${scope}: search route is not registered`);
  const screenPath=`apps/${scope==='owner'?'platform':scope}-mobile/app/search.tsx`;
  if(!fs.existsSync(new URL(screenPath,root)))failures.push(`${scope}: search screen missing`);

  const names=[...layout.matchAll(/<Tabs\.Screen name="([^"]+)"/g)]
    .map(match=>match[1])
    .filter(name=>!['index','auth','search'].includes(name)&&!name.includes('['));
  const start=index.indexOf(`  ${scope}:[`);
  const next=scope==='consumer'?'business':scope==='business'?'fleet':scope==='fleet'?'owner':null;
  const end=next?index.indexOf(`\n  ${next}:[`,start):index.indexOf('\n  ],\n};',start);
  if(start<0||end<0){failures.push(`${scope}: search index block missing`);continue;}
  const block=index.slice(start,end);
  const routes=[...block.matchAll(/route:'([^']+)'/g)].map(match=>match[1].replace(/^\//,''));
  for(const name of names)if(!routes.includes(name))failures.push(`${scope}: route ${name} is not searchable`);
}

for(const token of ['Freshness','How business claims work','Fleet Premium seats','Creator mission lifecycle']){
  if(!index.includes(token))failures.push(`knowledge search missing ${token}`);
}
for(const token of ['loadAppSearchRecents','rememberAppSearchQuery','searchAppIndex']){
  if(!index.includes(token))failures.push(`shared search capability missing ${token}`);
}

if(failures.length){
  console.error('Universal app search audit failed:\n'+failures.map(item=>'- '+item).join('\n'));
  process.exit(1);
}
console.log('Universal app search audit passed across Consumer, Business, Fleet and Owner.');
