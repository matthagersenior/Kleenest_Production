import fs from 'node:fs';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const required=[
  'apps/consumer-mobile/components/RestroomSignals.tsx',
  'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  'src/services/nearby.js',
  'src/runtime/ExplorePage.jsx',
  'src/styles.css',
];
for(const file of required)if(!fs.existsSync(file))failures.push('Missing freshness heat-ring surface: '+file);

if(!failures.length){
  const signals=read(required[0]);
  const explore=read(required[1]);
  const nearby=read(required[2]);
  const web=read(required[3]);
  const css=read(required[4]);

  for(const token of [
    'FreshnessHeatRing','freshnessHeatSignal','freshestEvidenceAt',
    "'#ef4444'","'#f97316'","'#facc15'","'#84cc16'","'#06b6d4'","'#3b82f6'","'#94a3b8'",
    'evidenceFrame={false}','FRESHNESS RING'
  ])if(!signals.includes(token))failures.push('Native freshness ring missing '+token);
  if(signals.includes("Needs verification · dashed ring"))failures.push('Map legend must not describe freshness as a dashed verification ring.');
  if(/freshestEvidenceAt\([^)]*\)[\s\S]{0,800}updated_at/.test(signals))failures.push('Freshness must not use generic updated_at metadata.');

  for(const token of ['FreshnessHeatRing','<FreshnessHeatRing','active={active}',"backgroundColor: 'transparent'"])
    if(!explore.includes(token))failures.push('Native Explore heat-ring wiring missing '+token);
  if(!explore.includes('<FreshnessHeatRing item={item} size={34} />'))
    failures.push('Native Explore search-result cards must render their place icon inside the freshness heat ring.');
  if(!explore.includes('<FreshnessHeatRing item={selected} size={34} active />'))
    failures.push('Native Explore selected map-pin card must render its place icon inside the freshness heat ring.');
  if(explore.includes("style={[s.marker,{backgroundColor:theme.surface,borderColor:theme.line}"))
    failures.push('Native map marker wrapper must not replace the freshness ring with a generic border.');

  for(const token of ['mobile_location_trust_summaries','mobile_location_network_statuses','trustById','networkById'])
    if(!nearby.includes(token))failures.push('Web nearby freshness enrichment missing '+token);

  for(const token of ['freshnessHeat','--freshness-ring','map-pin-icon','Ring = freshness','Selection uses a separate outline'])
    if(!web.includes(token))failures.push('Web freshness heat-ring wiring missing '+token);
  if(/freshestEvidenceAt\([^)]*\)[\s\S]{0,800}updated_at/.test(web))failures.push('Web freshness must not use generic updated_at metadata.');

  for(const token of ['--freshness-ring:#94a3b8','background:var(--freshness-ring)','outline:3px solid #102d20','.freshness-scale'])
    if(!css.includes(token))failures.push('Web heat-ring styling missing '+token);
  if(!css.includes('.map-pin.selected')||!css.includes('background:var(--freshness-ring)'))
    failures.push('Selected web pins must preserve freshness color while adding a separate selection treatment.');
}

if(failures.length){
  console.error('Map freshness heat-ring audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Map freshness heat-ring audit passed: freshness owns the heat ring, selection stays separate, and verification remains an independent signal.');
