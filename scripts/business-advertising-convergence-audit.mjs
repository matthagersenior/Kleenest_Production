import fs from 'node:fs';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const migration='supabase/migrations/20260920205000_business_self_service_sponsorship_and_network_ad_boundary.sql';
const required=[
 migration,
 'apps/business-mobile/services/advertising.ts',
 'apps/business-mobile/app/advertising.tsx',
 'apps/business-mobile/services/actionRegistry.ts',
 'apps/business-mobile/app/_layout.tsx',
 'apps/platform-mobile/app/relevance.tsx',
 'apps/consumer-mobile/components/SponsoredSlot.tsx',
];
for(const file of required)if(!fs.existsSync(file))failures.push(`Missing Business advertising surface: ${file}`);

if(!failures.length){
 const sql=read(migration);
 const service=read(required[1]);
 const page=read(required[2]);
 const actions=read(required[3]);
 const home=read('apps/business-mobile/app/index.tsx');
 const growth=read('apps/business-mobile/app/growth.tsx');
 const engagement=read('apps/business-mobile/app/engagement.tsx');
 const reviews=read('apps/business-mobile/app/reviews.tsx');
 const locations=read('apps/business-mobile/app/locations.tsx');
 const layout=read(required[4]);
 const owner=read(required[5]);
 const sponsored=read(required[6]);

 for(const token of [
  'consumer_network_ads_enabled',
  'not public.has_kleenest_premium()',
  'business_sponsorship_snapshot',
  'business_upsert_sponsored_campaign',
  'business_withdraw_sponsored_campaign',
  "'remove_ads_applies',false",
  "'premium_removes_sponsored',false",
  "'remove_ads_scope','network_only'",
  "c.status='active'",
 ]) if(!sql.includes(token))failures.push(`Advertising boundary migration missing: ${token}`);

 if(/consumer_sponsored_cards[\s\S]{0,900}has_kleenest_premium/.test(sql))failures.push('Direct Kleenest sponsorship must not be suppressed by the remove-ads entitlement.');
 for(const token of ['getBusinessSponsorshipSnapshot','saveBusinessSponsoredCampaign','withdrawBusinessSponsoredCampaign'])if(!service.includes(token))failures.push(`Business advertising service missing: ${token}`);
 for(const token of ['Create sponsored campaign','CONTEXTUAL TARGETING','CONSUMER PREVIEW','Submit for activation','Remove Ads','AdMob/network ads'])if(!page.includes(token))failures.push(`Business Advertise UI missing: ${token}`);
 if(!actions.includes("route:'/advertising'"))failures.push('Business Action Center must expose advertising.');
 for(const token of ["title:'Sponsored Ads'","title:'Campaigns & Promotions'","title:'Growth Performance'"])if(!home.includes(token))failures.push(`Business Grow IA missing: ${token}`);
 const sponsoredIndex=home.indexOf("href:'/advertising'"),campaignIndex=home.indexOf("href:'/engagement'"),performanceIndex=home.indexOf("href:'/growth'");
 if(!(sponsoredIndex>=0&&campaignIndex>=0&&performanceIndex>=0&&sponsoredIndex<campaignIndex&&campaignIndex<performanceIndex))failures.push('Grow order must be Sponsored Ads, Campaigns & Promotions, then Growth Performance.');
 for(const token of ["keywords:['ads','advertising','sponsored','sponsored ads'","Kleenest ad"])if(!actions.includes(token))failures.push(`Business advertising search coverage missing: ${token}`);
 for(const token of ['manageBusinessPromotion','manageBusinessCampaign','manageBusinessContest','manageBusinessEvent','pickAndUploadBusinessLocationPhoto','disputeBusinessReviewPhoto'])if(growth.includes(token))failures.push(`Growth Performance must be measurement-only and cannot own ${token}`);
 if(!engagement.includes('Create and operate customer programs.'))failures.push('Campaigns & Promotions must remain the canonical program CRUD surface.');
 if(!locations.includes('Add official photo'))failures.push('Official Business photo management must live with Locations.');
 if(!reviews.includes('disputeBusinessReviewPhoto'))failures.push('Community photo disputes must live with Reviews & Evidence.');
 if(!layout.includes('name="advertising"'))failures.push('Business router must register advertising.');
 if(!owner.includes('Direct Kleenest Sponsored recommendations remain available.'))failures.push('Owner policy copy must explain network-only ad removal.');
 for(const token of ['Paid placement','does not change Kleenest trust','Sponsored'])if(!sponsored.includes(token))failures.push(`Sponsored disclosure missing: ${token}`);
}
if(failures.length){console.error('Business advertising convergence audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Business advertising convergence audit passed.');
