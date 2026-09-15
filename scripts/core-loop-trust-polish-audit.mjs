import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const failures=[];
const requireToken=(source,token,label)=>{if(!source.includes(token))failures.push(`${label}: missing ${token}`);};

const marketing=read('apps/consumer-mobile/components/MarketingSitePro.tsx');
requireToken(marketing,'<LiveAppPreview />','Marketing hero');
requireToken(marketing,'Fresh · verified 9 min ago · 4 confirmations','Marketing trusted bathroom preview');
if(marketing.includes('<MarketingImage file="home-discovery.svg" label="Kleenest discovery, trust, QR and quest experience" />'))failures.push('Marketing hero still uses the static discovery illustration instead of the live product preview.');

const signals=read('apps/consumer-mobile/components/RestroomSignals.tsx');
for(const token of ['const ringSize=size+12','borderWidth:4'])requireToken(signals,token,'Freshness ring geometry');
if(signals.includes('active?5:4')||signals.includes('active?16:12'))failures.push('Freshness ring geometry still changes with active state.');

const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
for(const token of [
  '<CompactRestroomSignals item={item} />',
  'Why trusted?',
  'trustEvidenceLine(item)',
  '<FreshnessHeatRing item={row} size={22} />',
  '<FreshnessHeatRing item={selected} size={34} photoUrl={selected.consumer_photo_url ? String(selected.consumer_photo_url) : undefined} />',
  '<DecisionRestroomSignals item={selected} />',
  "selectedPanel: { position: 'absolute', left: 9, right: 54, bottom: 9, height: 228",
  "card: { borderRadius: 16, padding: 10",
  "cardMain: { gap: 4 }",
  "cardActionRow: { flexDirection: 'row', gap: 5",
  "close: { minWidth: 38, minHeight: 38",
  'Add a missing bathroom',
  'Name + address is enough to start.',
])requireToken(explore,token,'Explore core loop');
if(explore.includes('<RestroomSignals item={item} compact />'))failures.push('Explore result cards still use the taller labeled restroom signals.');
if(explore.includes("{selected ? 'Selected on map' : 'Tap this card to focus its map pin'}"))failures.push('Explore still spends card height on the redundant map-selection hint.');
if(explore.includes('size={active ? 28 : 22}')||explore.includes('active={active}'))failures.push('Map marker selection still changes freshness-ring geometry.');

const location=read('apps/consumer-mobile/app/location/[id].tsx');
for(const token of [
  '<FreshnessHeatRing item={place} size={50}/>',
  'freshnessHeatSignal(place)',
  'confidenceEvidenceCount',
])requireToken(location,token,'Location details freshness and evidence consistency');

const discover=read('apps/consumer-mobile/app/discover.tsx');
for(const token of [
  'Put it on the map in under a minute.',
  'Name or address is enough to start.',
  'FAST ADD',
  'Add to Kleenest',
  'The place is in Kleenest.',
  'You can leave now.',
  'Strengthen it · optional',
  'What do you know? · optional',
  "router.replace('/explore')",
])requireToken(discover,token,'Missing bathroom fast path');

const business=read('apps/business-mobile/app/index.tsx');
for(const token of [
  'SELF-SERVE START',
  'Find + claim the location',
  'Verify business authority',
  '/verification-center',
  'Monitor + recover trust',
])requireToken(business,token,'Business self-serve path');

if(failures.length){
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Core-loop trust polish audit passed: live hero preview, stable freshness rings, compact evidence, frictionless missing-place contribution, and Business self-serve path are present.');
