import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const source=read('apps/consumer-mobile/components/MarketingSitePro.tsx');
const expect=(value,pattern,label)=>{if(!pattern.test(value))failures.push(label);};

for(const file of [
  'public/marketing/home-discovery.svg',
  'public/marketing/home-progress.svg',
  'public/marketing/business-growth.svg',
  'public/marketing/business-live-ops.svg',
]){
  if(!fs.existsSync(file))failures.push(`missing public marketing image: ${file}`);
}

expect(source,/Find clean bathrooms you can actually trust\./,'consumer homepage must lead with clean-bathroom discovery and trust');
expect(source,/home-discovery\.svg/,'consumer homepage hero must render Kleenest discovery imagery');
expect(source,/home-progress\.svg/,'consumer homepage must render progress and gamification imagery');
expect(source,/Quests, missions, journeys, challenges and contests/,'consumer homepage must explain usefulness-driven gamification');
expect(source,/Cleaner restrooms\. Stronger businesses\./,'For Business must lead with the customer/business value proposition');
expect(source,/business-growth\.svg/,'For Business must render QR, customer engagement and analytics imagery');
expect(source,/business-live-ops\.svg/,'For Business must render Live Ops and smart-device imagery');
expect(source,/LIVE OPS \+ SMART DEVICES/,'For Business must explicitly sell Live Ops and connected-device value');
expect(source,/Onboarding begins only after you choose to start/,'For Business must remain a sales page before onboarding');
expect(source,/openBusinessPortal\('signup'\)/,'Business Start CTA must enter the explicit account/setup flow');
expect(source,/openBusinessPortal\('signin'\)/,'Business page must preserve existing-customer sign in');

if(failures.length){
  console.error('Public marketing imagery audit failed:');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Public marketing imagery audit passed: Home and For Business are visual, consumer-first/business-value-first, and preserve explicit onboarding entry.');
