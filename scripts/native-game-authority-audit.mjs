import fs from 'node:fs';

const required=[
  'apps/consumer-mobile/services/games.ts',
  'apps/consumer-mobile/app/games.tsx',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/app/_layout.tsx',
];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing mobile Game Center file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const screen=fs.readFileSync(required[1],'utf8');
  const play=fs.readFileSync(required[2],'utf8');
  const layout=fs.readFileSync(required[3],'utf8');
  for(const code of ['trust_or_bust','flush_the_facts','restroom_relay','route_to_relief','review_rater','evidence_detective','cleanliness_clash']) if(!service.includes(code)) failures.push(`Game Center missing canonical game code: ${code}`);
  for(const rpc of ['record_game_result','list_game_challenge_targets','list_game_challenges','create_game_challenge','respond_game_challenge','record_game_challenge_score']) if(!service.includes(`rpc('${rpc}'`)) failures.push(`Game Center service missing canonical RPC: ${rpc}`);
  if(!service.includes('question.options.map((text,index)=>({text,index}))')||!service.includes('[options[i],options[j]]=[options[j],options[i]]')) failures.push('Game Center shuffle must preserve original answer identity while using Fisher-Yates.');
  if(!screen.includes('originalIndex===presented.correctIndex')||screen.includes('option.text===presented.options[0]')) failures.push('Game Center correctness must compare original answer index, not rendered position.');
  if(!screen.includes('recordGameResult')||!screen.includes('recordGameChallengeScore')) failures.push('Game Center scores must persist through canonical game authorities.');
  if(!play.includes("router.push('/games')")||!play.includes('Game Center')) failures.push('Play must launch the hidden Game Center route.');
  if(!layout.includes('<Tabs.Screen name="games" options={{ href: null }}/>')) failures.push('Game Center must remain hidden beneath Play rather than becoming a competing primary tab.');
  if(/\.from\(['"](?:game_results|game_challenges|point_transactions)['"]\)/.test(service+screen)) failures.push('Game Center must not create a direct alternate scoring/challenge store.');
}
if(failures.length){console.error('Native game authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native game authority audit passed.');
