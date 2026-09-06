import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireFile=path=>{must(fs.existsSync(path),`missing converged app route: ${path}`);return read(path)};
const discover=(label,route,sources)=>must(sources.some(source=>source.includes(route)),`${label} exists but is not discoverable from its canonical app workflow: ${route}`);

// Business standalone capability inventory -> Production Business app.
const businessIndex=requireFile('apps/business-mobile/app/index.tsx');
const businessLayout=requireFile('apps/business-mobile/app/_layout.tsx');
const businessQr=requireFile('apps/business-mobile/app/qr-studio.tsx');
const businessSources=[businessIndex,businessLayout];
const businessRoutes=[
 'assistant','auth','capabilities','engagement','enterprise-economy','enterprise-locations','enterprise','governance','intelligence','live-network','locations','members','notifications','prevention','profile','progression','qr-designer','qr-studio','reviews','trust-operations'
];
for(const route of businessRoutes)requireFile(`apps/business-mobile/app/${route}.tsx`);
for(const route of ['assistant','capabilities','engagement','enterprise-economy','enterprise-locations','enterprise','governance','intelligence','live-network','locations','members','notifications','prevention','profile','progression','qr-studio','reviews','trust-operations'])discover('Business',`/${route}`,businessSources);
discover('Business QR visual designer','/qr-designer',[businessIndex,businessQr,businessLayout]);
must(businessLayout.includes('name="engagement" options={{title:\'Growth\'}}'), 'Business Growth tab must resolve to the full engagement CRUD surface.');

// Fleet standalone capability inventory -> Production Fleet app. Standalone intelligence is canonically named insights in Production.
const fleetIndex=requireFile('apps/fleet-mobile/app/index.tsx');
const fleetLayout=requireFile('apps/fleet-mobile/app/_layout.tsx');
const fleetRoutes=['auth','capabilities','dispatch','enterprise','execution','index','insights','metrics','operations','premium','progression','signals','sync'];
for(const route of fleetRoutes)requireFile(`apps/fleet-mobile/app/${route}.tsx`);
for(const route of ['capabilities','dispatch','enterprise','execution','insights','metrics','operations','premium','progression','signals','sync'])discover('Fleet',`/${route}`,[fleetIndex,fleetLayout]);
must(fleetIndex.includes('Intelligence')&&fleetIndex.includes('/insights'),'Fleet standalone Intelligence capability must remain exposed as the Production Insights workflow.');

// Owner/KleenestOS standalone capability inventory -> Production platform app. Standalone reports are folded into the richer moderation command center.
const ownerIndex=requireFile('apps/platform-mobile/app/index.tsx');
const ownerLayout=requireFile('apps/platform-mobile/app/_layout.tsx');
const ownerModeration=requireFile('apps/platform-mobile/app/moderation.tsx');
const ownerRoutes=['access','audit','auth','businesses','capabilities','data','index','intelligence','moderation','operations','progression','reports'];
for(const route of ownerRoutes)requireFile(`apps/platform-mobile/app/${route}.tsx`);
for(const route of ['access','audit','businesses','capabilities','data','intelligence','moderation','operations','progression'])discover('KleenestOS',`/${route}`,[ownerIndex,ownerLayout]);
must(ownerModeration.includes('Review reports')&&ownerModeration.includes('User safety reports')&&ownerModeration.includes('AI response reports'),'KleenestOS moderation must subsume the standalone Reports surface without losing report queues.');

if(failures.length){
 console.error(`Standalone app convergence audit failed with ${failures.length} gap(s):`);
 failures.forEach(failure=>console.error(`- ${failure}`));
 process.exit(1);
}
console.log('Standalone app convergence audit passed: Business, Fleet and KleenestOS source capabilities are present and reachable in the Production apps.');
