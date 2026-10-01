import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const failures=[];
const expect=(condition,message)=>{if(!condition)failures.push(message)};
const exists=relative=>fs.existsSync(path.join(root,relative));

const explorePath='apps/consumer-mobile/features/AdaptiveExploreScreen.tsx';
const reviewPath='apps/consumer-mobile/app/location/[id].tsx';
const consumerAssistantPath='apps/consumer-mobile/app/assistant.tsx';
const consumerLayoutPath='apps/consumer-mobile/app/_layout.tsx';
const businessIntelligencePath='apps/business-mobile/app/intelligence.tsx';
const businessAssistantPath='apps/business-mobile/app/assistant.tsx';
const businessLayoutPath='apps/business-mobile/app/_layout.tsx';
const fleetInsightsPath='apps/fleet-mobile/app/insights.tsx';
const intentPath='apps/consumer-mobile/services/discoveryIntent.ts';
const edgePath='supabase/functions/consumer-search-intent/index.ts';

expect(exists(intentPath),'Consumer discovery intent service must exist.');
expect(exists(edgePath),'Guest-safe consumer search intent Edge Function source must exist.');

const explore=read(explorePath);
expect(explore.includes('interpretDiscoveryIntent'),'Explore must interpret natural-language discovery intent.');
expect(explore.includes('Why this match?'),'Explore results must expose a grounded Why this match? explanation.');
expect(!/Kleenest AI|Ask .*AI|AI ASSIST/i.test(explore),'Explore must not present the feature as AI.');

const review=read(reviewPath);
expect(review.includes('Help me phrase this'),'Verified review flow must offer ordinary-language writing help.');
expect(review.includes("'visit_review'")||review.includes('"visit_review"'),'Review writing help must use the grounded visit_review task.');
expect(!/Ask .*AI|Kleenest AI|AI ASSIST/i.test(review),'Review writing help must not be branded as AI.');

if(exists(edgePath)){
  const edge=read(edgePath);
  expect(!/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(edge),'Guest search interpreter must not use service-role credentials.');
  expect(!/createClient\s*\(|\bsupabase\w*\.from\s*\(|\bclient\w*\.from\s*\(|\b(?:supabase|client)\w*\.rpc\s*\(/i.test(edge),'Guest search interpreter must not create a Supabase client or query/mutate Kleenest data.');
  expect(/deterministic|fallback/i.test(edge),'Guest search interpreter must have deterministic fallback behavior.');
}

const overt=/KLEENEST AI|Kleenest AI|Ask Kleenest AI|Business copilot|AI ASSIST|AI response|AI suggestions/i;
for(const relative of[consumerAssistantPath,consumerLayoutPath,businessIntelligencePath,businessAssistantPath,businessLayoutPath]){
  const source=read(relative);
  expect(!overt.test(source),`${relative} must use product-language guidance instead of overt AI branding.`);
}
const fleet=read(fleetInsightsPath);
expect(/FLEET INTELLIGENCE/i.test(fleet),'Fleet intelligence remains a contextual operational surface.');

if(failures.length){
  console.error(`Ambient intelligence product audit failed with ${failures.length} issue${failures.length===1?'':'s'}:`);
  failures.forEach(value=>console.error(`- ${value}`));
  process.exit(1);
}
console.log('Ambient intelligence product audit passed: intelligence is contextual, grounded, and not chatbot-shaped.');
