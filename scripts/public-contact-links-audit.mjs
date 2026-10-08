import fs from 'node:fs';
const failures=[];
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
function check(value,msg){if(!value)failures.push(msg)}
const entries=JSON.parse(read('config/public-contact-directory.json')||'{}');
const page=read('public/contact.html');
const channels=['help','support','info','contact','feedback','business','fleet','partnerships','privacy','admin'];
check(entries.contacts?.length===channels.length,'unexpected directory entries');
for(const channel of channels){
  const address=channel+'@kleenest.us';
  check(entries.contacts?.some(x=>x.address===address),'directory missing '+address);
  check(page.includes('href="mailto:'+address+'"'),'contact page missing mailto '+address);
}
check(entries.aliases?.['help@kleenest.us']==='support@kleenest.us','help alias must route to support');
check(entries.aliases?.['contact@kleenest.us']==='hello@kleenest.us','contact alias must route to hello');
for(const [file,addresses] of [
  ['apps/consumer-mobile/app/support.tsx',['help@kleenest.us','info@kleenest.us','feedback@kleenest.us']],
  ['apps/business-mobile/app/support.tsx',['business@kleenest.us','help@kleenest.us']],
  ['apps/fleet-mobile/app/support.tsx',['fleet@kleenest.us','help@kleenest.us']],
  ['apps/platform-mobile/app/support.tsx',['admin@kleenest.us','https://mail.kleenest.us/']],
  ['apps/platform-mobile/app/communications.tsx',['https://mail.kleenest.us/']],
  ['apps/consumer-mobile/app/install.tsx',['https://kleenest.us/contact/']],
])for(const address of addresses)check(read(file).includes(address),file+' missing '+address);
for(const [name,address] of [['privacy','privacy'],['terms','support'],['account-deletion','privacy'],['community-guidelines','support']])
  check(read('public/legal/'+name+'.html').includes('mailto:'+address+'@kleenest.us'),name+' legal email route missing');
const client=read('apps/mail-client/src/main.jsx');
check(client.includes('href="https://kleenest.us/owner/communications"'),'mail client must link to Owner correct hostname');
check(client.includes('href="https://kleenest.us/legal/privacy.html"'),'mail client privacy link must use correct hostname');
const pub=read('.github/workflows/publish-standalone-installer.yml');
check(pub.includes('cp public/contact.html apps/consumer-mobile/dist/contact/index.html'),'Pages contact route is not deployed');
check(pub.includes('owner_routes="communications mail-admin'),'Owner direct email link routes unavailable');
check(read('scripts/prepare-consumer-web-seo.mjs').includes("route:'/contact/'"),'Contact SEO sitemap entry missing');
if(failures.length){console.error('Public contact routing audit failed:');for(const fail of failures)console.error('- '+fail);process.exit(1)}
console.log('Public contact routing audit passed: 10 email addresses, live aliases, native app, legal, Owner, and Pages links.');
