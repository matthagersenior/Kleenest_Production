import fs from 'node:fs';

const progress=fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8');
const service=fs.readFileSync('apps/consumer-mobile/services/discoveryProgression.ts','utf8');

if(progress.includes('<Text style={[s.cardTitle,{color:theme.ink}]}>Kleenest contributor</Text>')){
  throw new Error('Progress leaderboard still hides contributor names behind a generic label.');
}
if(!/r\.display_name\s*\|\|\s*r\.username\s*\|\|\s*['"]Kleenest contributor['"]/.test(progress)){
  throw new Error('Progress leaderboard must render the canonical public contributor name with username fallback.');
}
if(!/consumer_progression_rankings[\s\S]{0,1000}community_contributor_summaries/.test(service)){
  throw new Error('Progression ranking rows must be hydrated from canonical public contributor summaries.');
}
console.log('leaderboard contributor-name contract passed');
