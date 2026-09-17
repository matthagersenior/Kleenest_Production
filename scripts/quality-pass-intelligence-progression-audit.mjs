import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const requireFile=(file)=>{const full=path.join(root,file);if(!fs.existsSync(full)){failures.push(`missing ${file}`);return '';}return fs.readFileSync(full,'utf8');};
const expect=(file,needle,label=needle)=>{const text=requireFile(file);if(text&&!text.includes(needle))failures.push(`${file} missing ${label}`);};
const expectAny=(file,needles,label)=>{const text=requireFile(file);if(text&&!needles.some((needle)=>text.includes(needle)))failures.push(`${file} missing ${label}`);};

const migration='supabase/migrations/20260917050000_quality_pass_intelligence_progression.sql';
for(const fn of ['location_intelligence_explanation','location_proof_card','consumer_route_confidence','consumer_location_trust_watch','consumer_location_trust_changes','owner_product_truth'])expect(migration,fn,`RPC ${fn}`);
for(const kind of ['coverage_verification','freshness_recheck','amenity_confirmation','route_gap_verification'])expect(migration,kind,`Coverage Mission kind ${kind}`);
expect(migration,'location_trust_watches','trust-watch authority');
expect(migration,'enable row level security','trust-watch RLS');
expect(migration,'progression_events_v2','canonical progression ledger');
expect(migration,'consumer_progression_world','Progression World extension');
expect(migration,'consumer_nearby_progression_opportunities','existing progression opportunity extension');

expect('apps/consumer-mobile/services/intelligenceLayer.ts','getLocationExplanation','Consumer explanation wrapper');
expect('apps/consumer-mobile/services/intelligenceLayer.ts','getLocationProofCard','Consumer proof-card wrapper');
expect('apps/consumer-mobile/services/intelligenceLayer.ts','setLocationTrustWatch','Consumer trust-watch wrapper');
expect('apps/consumer-mobile/services/intelligenceLayer.ts','getLocationTrustChanges','Consumer trust-change wrapper');
expect('apps/consumer-mobile/services/intelligenceLayer.ts','getConsumerRouteConfidence','Consumer route-confidence wrapper');

expect('apps/consumer-mobile/app/intelligence.tsx','WHY KLEENEST?','Consumer Why Kleenest surface');
expect('apps/consumer-mobile/app/intelligence.tsx','PROOF CARD','Consumer proof-card surface');
expectAny('apps/consumer-mobile/app/intelligence.tsx',['TRUST CHANGE ALERTS','MEANINGFUL CHANGES'],'Consumer trust-change surface');
expect('apps/consumer-mobile/app/progress.tsx','COVERAGE MISSIONS','Coverage Missions in Progression');
expect('apps/consumer-mobile/app/progress.tsx','League','Coverage Mission League integration copy');
expect('apps/consumer-mobile/app/route.tsx','ROUTE CONFIDENCE','Consumer route confidence');
expect('apps/business-mobile/app/service-freshness.tsx','WHY FIX FIRST','Business evidence explanation');
expect('apps/fleet-mobile/app/coverage.tsx','WHY THIS COVERAGE?','Fleet coverage explanation');
expect('apps/platform-mobile/app/intelligence.tsx','PRODUCT TRUTH','Owner Product Truth');

const search='packages/mobile-core/src/appSearch.ts';
for(const term of ['Why Kleenest','Coverage Missions','Route Confidence','Trust Change Alerts','Proof Card','Why Fix First','Product Truth'])expect(search,term,`search entry ${term}`);

const progression=read('apps/consumer-mobile/services/discoveryProgression.ts');
if(/coverage.*(ledger|xp_events|league).*create/i.test(progression))failures.push('Consumer progression appears to create a parallel Coverage Mission ledger/League authority');
const intelligence=read('apps/consumer-mobile/app/intelligence.tsx');
const passiveHandlerCoupledToProgression=/(shareProof|toggleWatch)[\s\S]{0,900}(record_progression|recordProgression|awardXp|progression_events_v2)/i.test(intelligence);
if(passiveHandlerCoupledToProgression)failures.push('Passive share/watch handler appears coupled to the progression authority');

if(failures.length){console.error(`Quality-pass intelligence/progression audit failed (${failures.length}):`);for(const failure of failures)console.error(` - ${failure}`);process.exit(1);}
console.log('Quality-pass intelligence/progression audit passed: all six intelligence extensions converge on the existing progression, League and evidence authorities.');
