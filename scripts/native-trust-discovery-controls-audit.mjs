import fs from 'node:fs';
const failures=[];
const files=['apps/consumer-mobile/services/trustDiscoveryControls.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/saved.tsx'];
for(const file of files)if(!fs.existsSync(file))failures.push(`missing trust discovery control file: ${file}`);
if(!failures.length){
  const [service,explore,saved]=files.map(file=>fs.readFileSync(file,'utf8'));
  for(const token of ["TrustEvidenceFilter='any'|'verified'|'fresh'","TrustSortMode='default'|'evidence'",'hasVerifiedTrustEvidence','hasFreshTrustEvidence','applyTrustDiscoveryControls'])if(!service.includes(token))failures.push(`Trust discovery service missing: ${token}`);
  if(!service.includes("if(sort==='evidence')")||!service.includes('routeTrustScore(b.trust)-routeTrustScore(a.trust)'))failures.push('Evidence sorting must remain an explicit opt-in branch using shared trust scoring.');
  if(!service.includes("filter==='verified'")||!service.includes("filter==='fresh'"))failures.push('Verified and fresh evidence filters must remain explicit.');

  // Saved is the deliberate advanced trust-comparison surface. Explore remains the fast
  // distance/search/amenity finder and may show lightweight trust badges without making
  // evidence sorting part of the critical bathroom-finding path.
  if(!saved.includes('applyTrustDiscoveryControls(rows,evidenceFilter,sortMode)'))failures.push('Saved must derive a visible result set from explicit trust controls.');
  for(const label of ['Any','Verified','Fresh ≤30d','Evidence','Original'])if(!saved.includes(label))failures.push(`Saved missing trust control label: ${label}`);
  if(!saved.includes("sortMode==='default'")||!saved.includes("sortMode==='evidence'"))failures.push('Saved must expose default and evidence sort states.');
  const preservesDefaultOrder=saved.includes('Your saved order is unchanged unless you explicitly choose Evidence.')&&saved.includes("setSortMode('default')")&&saved.includes('Switch to Original to restore your saved order.');
  if(!preservesDefaultOrder)failures.push('Saved must preserve original order by default and clearly expose restoring it.');
  if(!saved.includes('data={visibleRows}'))failures.push('Saved list must render the explicitly filtered visible set.');

  if(explore.includes('applyTrustDiscoveryControls(')||explore.includes('Evidence filter')||explore.includes('Nearby order stays authoritative unless you explicitly choose Evidence.'))failures.push('Explore must stay bathroom-first; advanced evidence filtering/sorting belongs outside the critical finder path.');
  for(const token of ['Find a trusted bathroom.','What matters on this stop?','Start directions','Search a place, address or brand'])if(!explore.includes(token))failures.push(`Explore bathroom-first discovery contract missing ${token}.`);
  if(!explore.replace(/\s+/g,'').includes('pathname:"/route"'))failures.push('Explore bathroom-first discovery contract missing route handoff.');
  if(/rows\.sort\(|setRows\([^)]*sort/i.test(explore+saved))failures.push('Screens must not mutate underlying discovery/saved rows when sorting by evidence.');
}
if(failures.length){console.error('Native trust discovery controls audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native trust discovery controls audit passed.');
