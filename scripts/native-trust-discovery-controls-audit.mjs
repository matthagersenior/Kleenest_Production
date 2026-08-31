import fs from 'node:fs';
const failures=[];
const files=['apps/consumer-mobile/services/trustDiscoveryControls.ts','apps/consumer-mobile/app/explore.tsx','apps/consumer-mobile/app/saved.tsx'];
for(const file of files)if(!fs.existsSync(file))failures.push(`missing trust discovery control file: ${file}`);
if(!failures.length){
  const [service,explore,saved]=files.map(file=>fs.readFileSync(file,'utf8'));
  for(const token of ["TrustEvidenceFilter='any'|'verified'|'fresh'","TrustSortMode='default'|'evidence'",'hasVerifiedTrustEvidence','hasFreshTrustEvidence','applyTrustDiscoveryControls'])if(!service.includes(token))failures.push(`Trust discovery service missing: ${token}`);
  if(!service.includes("if(sort==='evidence')")||!service.includes('routeTrustScore(b.trust)-routeTrustScore(a.trust)'))failures.push('Evidence sorting must be an explicit opt-in branch using shared trust scoring.');
  if(!service.includes("filter==='verified'")||!service.includes("filter==='fresh'"))failures.push('Verified and fresh evidence filters must be explicit.');
  for(const [name,content] of [['Explore',explore],['Saved',saved]]){
    if(!content.includes('applyTrustDiscoveryControls(rows,evidenceFilter,sortMode)'))failures.push(`${name} must derive a visible result set from explicit trust controls.`);
    for(const label of ['Any','Verified','Fresh ≤30d','Evidence'])if(!content.includes(label))failures.push(`${name} missing trust control label: ${label}`);
    if(!content.includes("sortMode==='default'")||!content.includes("sortMode==='evidence'"))failures.push(`${name} must expose both default and evidence sort states.`);
  }
  if(!explore.includes('Nearby order stays authoritative unless you explicitly choose Evidence.')||!explore.includes("setSortMode('default')"))failures.push('Explore must preserve nearby order by default and clearly expose restoring it.');
  if(!saved.includes('Your saved order stays unchanged unless you explicitly choose Evidence.')||!saved.includes("setSortMode('default')"))failures.push('Saved must preserve original order by default and clearly expose restoring it.');
  if(!explore.includes('data={visibleRows}')||!saved.includes('data={visibleRows}'))failures.push('Explore and Saved lists must render the explicitly filtered visible set.');
  if(/rows\.sort\(|setRows\([^)]*sort/i.test(explore+saved))failures.push('Screens must not mutate underlying discovery/saved rows when sorting by evidence.');
}
if(failures.length){console.error('Native trust discovery controls audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native trust discovery controls audit passed.');
