import fs from 'node:fs';

const required=[
  'apps/consumer-mobile/services/games.ts',
  'apps/consumer-mobile/services/gameModes.ts',
  'apps/consumer-mobile/app/games.tsx',
  'apps/consumer-mobile/app/play.tsx',
  'apps/consumer-mobile/app/_layout.tsx',
];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing mobile Game Center file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync(required[0],'utf8');
  const modes=fs.readFileSync(required[1],'utf8');
  const screen=fs.readFileSync(required[2],'utf8');
  const play=fs.readFileSync(required[3],'utf8');
  const layout=fs.readFileSync(required[4],'utf8');
  for(const code of ['clean_sweep','bathroom_memory','trust_or_bust','flush_the_facts','restroom_relay','stall_strategy','sink_sprint','route_to_relief','review_rater','evidence_detective','amenity_architect','cleanliness_clash']) if(!modes.includes(`code:'${code}'`)) failures.push(`Game Center missing canonical game code: ${code}`);
  for(const mode of ['evidence_tap','memory','trust_quiz','rapid_fire','relay','strategy','amenity_sprint','route_puzzle','ranking','detective','builder','multiplayer_trust']) if(!modes.includes(`'${mode}'`)) failures.push(`Game Center missing distinct gameplay mode: ${mode}`);
  for(const rpc of ['record_game_result','list_game_challenge_targets','list_game_challenges','create_game_challenge','respond_game_challenge','record_game_challenge_score']) if(!service.includes(`rpc('${rpc}'`)) failures.push(`Game Center service missing canonical RPC: ${rpc}`);
  if(!modes.includes('MEMORY_PAIRS')||!screen.includes('flipMemory')) failures.push('Bathroom Memory must use a real pair-matching state machine.');
  if(!modes.includes('BUILDER_SCENARIOS')||!screen.includes('submitBuilder')) failures.push('Amenity Architect must use multi-select builder state.');
  if(!screen.includes('index===current.correct')) failures.push('Choice modes must score against the explicit canonical correct choice.');
  if(!screen.includes('recordGameResult')||!screen.includes('recordGameChallengeScore')) failures.push('Game Center scores must persist through canonical game authorities.');
  if(!screen.includes('getMobileProgressionDashboard')||!screen.includes('listMobileBadges')||!screen.includes('progressionMessage')) failures.push('Game Center score saves must surface canonical progression deltas.');
  if(!screen.includes("router.push('/play')")||!screen.includes('See your progress')) failures.push('Game Center progression feedback must hand off to Play.');
  if(!screen.includes('createGameChallenge')||!screen.includes('playChallenge')) failures.push('Game Center must preserve canonical multiplayer challenge flow.');
  if(!play.includes("router.push('/games')")||!play.includes('Game Center')) failures.push('Play must launch the hidden Game Center route.');
  if(!layout.includes('<Tabs.Screen name="games" options={{ href: null }}/>')) failures.push('Game Center must remain hidden beneath Play rather than becoming a competing primary tab.');
  if(/\.from\(['"](?:game_results|game_challenges|point_transactions)['"]\)/.test(service+screen)) failures.push('Game Center must not create a direct alternate scoring/challenge store.');
}
if(failures.length){console.error('Native game authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native game authority audit passed.');
