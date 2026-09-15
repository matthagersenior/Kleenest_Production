import fs from 'node:fs';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const required=[
  'supabase/migrations/20260915060126_relevance_sponsorship_control_plane.sql',
  'supabase/migrations/20260915060229_relevance_sponsorship_public_policy_and_fallbacks.sql',
  'supabase/migrations/20260915061012_harden_relevance_public_rpc_boundary.sql',
  'supabase/migrations/20260915061134_harden_sponsored_event_integrity.sql',
  'apps/consumer-mobile/services/heroRelevance.ts',
  'apps/consumer-mobile/components/RelevanceHeroCarousel.tsx',
  'apps/consumer-mobile/services/sponsorship.ts',
  'apps/consumer-mobile/components/SponsoredSlot.tsx',
  'apps/consumer-mobile/app/index.tsx',
  'apps/platform-mobile/app/relevance.tsx',
  'apps/platform-mobile/services/ownerAdmin.ts',
  'apps/platform-mobile/app/_layout.tsx',
];
for(const file of required)if(!fs.existsSync(file))failures.push(`Missing relevance/sponsorship surface: ${file}`);

if(!failures.length){
  const migration=read(required[0]);
  const hardening=read(required[1]);
  const publicBoundary=read(required[2]);
  const eventHardening=read(required[3]);
  const hero=read('apps/consumer-mobile/services/heroRelevance.ts');
  const carousel=read('apps/consumer-mobile/components/RelevanceHeroCarousel.tsx');
  const sponsored=read('apps/consumer-mobile/components/SponsoredSlot.tsx');
  const home=read('apps/consumer-mobile/app/index.tsx');
  const owner=read('apps/platform-mobile/app/relevance.tsx');
  const ownerService=read('apps/platform-mobile/services/ownerAdmin.ts');
  const ownerLayout=read('apps/platform-mobile/app/_layout.tsx');

  for(const token of ['organic_hero_no_paid_kinds','ad_placements_not_hero_check','consumer_ads_enabled','not public.has_kleenest_premium()','consumer_sponsored_cards','sensitive or unsupported targeting key','owner_relevance_sponsorship_snapshot','relevance_sponsorship'])
    if(!migration.includes(token))failures.push(`Control-plane migration missing invariant: ${token}`);
  if(!hardening.includes("owner_enabled=true"))failures.push('Public sponsored placement visibility must honor the owner kill switch.');
  for(const token of ['security invoker','revoke execute on function public.consumer_sponsored_cards','organic_hero_policy_public_read'])if(!publicBoundary.toLowerCase().includes(token))failures.push(`Public relevance boundary missing hardening: ${token}`);
  for(const token of ['sponsored_campaign_destination_https_check','revoke insert on public.sponsored_events','60 seconds','security definer'])if(!eventHardening.toLowerCase().includes(token))failures.push(`Sponsored event integrity missing hardening: ${token}`);

  for(const kind of ['review_ready','active_mission','fresh_kleenest','saved_choice','top_ranked','next_objective','find_bathroom','share_knowledge','scan_qr'])
    if(!hero.includes(kind))failures.push(`Organic hero ranking missing candidate: ${kind}`);
  if(/sponsored|advertisement|paid/i.test(hero))failures.push('Organic hero ranking service must not contain paid inventory.');
  if(!carousel.includes('pagingEnabled')||!carousel.includes('dotIndicators')||!carousel.includes('onMomentumScrollEnd'))failures.push('Organic hero carousel must support swipe paging and moving dot indicators.');
  if(carousel.includes('SponsoredSlot'))failures.push('Sponsored content must not render inside the organic hero carousel.');

  for(const token of ['RelevanceHeroCarousel','buildConsumerHomeHeroes','SponsoredSlot surface="home"'])if(!home.includes(token))failures.push(`Consumer Home missing relevance/sponsorship separation: ${token}`);
  for(const token of ['Paid placement','does not change Kleenest trust','Sponsored'])if(!sponsored.includes(token))failures.push(`Sponsored card disclosure missing: ${token}`);

  for(const token of ['Organic hero policies','Sponsored inventory','Create sponsored campaign','Hard product boundaries'])if(!owner.includes(token))failures.push(`KleenestOS relevance surface missing control: ${token}`);
  for(const token of ['getOwnerRelevanceSponsorshipSnapshot','updateOwnerHeroPolicy','updateOwnerSponsoredPlacement','upsertOwnerSponsoredCampaign'])if(!ownerService.includes(token))failures.push(`Owner service missing relevance control: ${token}`);
  if(!ownerLayout.includes('name="relevance"'))failures.push('KleenestOS must register the Relevance + Sponsorship owner route.');
}

if(failures.length){console.error('Relevance + sponsorship audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Relevance + sponsorship audit passed.');
