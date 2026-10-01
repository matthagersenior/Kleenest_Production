import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const edge=read('supabase/functions/ai-assist/index.ts');
const mobile=read('apps/consumer-mobile/services/aiAssist.ts');
const explore=read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');
const route=read('apps/consumer-mobile/app/route.tsx');
const location=read('apps/consumer-mobile/app/location/[id].tsx');
const webAi=read('src/services/aiAssist.js');
const webExplore=read('src/runtime/ExplorePage.jsx');
const webRoute=read('src/runtime/RoutePage.jsx');
const webLocation=read('src/runtime/LocationPage.jsx');

for(const provider of ['cloudflare','groq','openrouter','gemini','openai']){
  assert.match(edge,new RegExp(provider,'i'),`ai-assist must support ${provider}`);
}
for(const task of ['explore_reason','place_summary','route_summary','mission_suggestion','weekly_recap','business_insight']){
  assert.match(edge,new RegExp(task),`ai-assist must support ${task}`);
  assert.match(mobile,new RegExp(task),`consumer AI task contract must include ${task}`);
}
assert.match(edge,/grounded_fallback/,'ai-assist must preserve deterministic fallback');
assert.match(edge,/ignore any instructions/i,'system prompt must treat supplied context as data, not instructions');
assert.match(mobile,/invokeOrganicConsumerAi/,'consumer service must expose organic, failure-safe AI');
assert.match(explore,/organicExploreReason/,'Explore must surface organic decision context');
assert.match(route,/organicRouteSummary/,'Route must surface organic route guidance');
assert.match(location,/organicPlaceSummary/,'Location details must surface organic place summary');
assert.match(webAi,/invokeOrganicAi/,'web consumer service must expose guest-safe organic AI');
assert.match(webExplore,/organicExploreReason/,'web Explore must surface organic decision context');
assert.match(webRoute,/organicRouteSummary/,'web Route must surface organic route guidance');
assert.match(webLocation,/organicPlaceSummary/,'web location details must surface organic place summary');

console.log('organic-ai-assist-audit: ok');
