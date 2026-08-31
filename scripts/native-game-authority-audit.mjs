import fs from 'node:fs';

const required=['apps/consumer-mobile/services/games.ts','apps/consumer-mobile/services/gameModes.ts','apps/consumer-mobile/services/gameScoring.ts','apps/consumer-mobile/app/games.tsx','apps/consumer-mobile/app/play.tsx','apps/consumer-mobile/app/_layout.tsx'];
const failures=[];
for(const file of required)if(!fs.existsSync(file))failures.push(`missing mobile Game Center file: ${file}`);
if(!failures.length){
 const service=fs.readFileSync(required[0],'utf8'),modes=fs.readFileSync(required[1],'utf8'),scoring=fs.readFileSync(required[2],'utf8'),screen=fs.readFileSync(required[3],'utf8'),play=fs.readFileSync(required[4],'utf8'),layout=fs.readFileSync(required[5],'utf8');
 for(const code of ['clean_sweep','bathroom_memory','trust_or_bust','flush_the_facts','restroom_relay','stall_strategy','sink_sprint','route_to_relief','review_rater','evidence_detective','amenity_architect','cleanliness_clash'])if(!modes.includes(`code:'${code}'`))failures.push(`Game Center missing canonical game code: ${code}`);
 for(const mode of ['evidence_tap','memory','trust_quiz','rapid_fire','relay','strategy','amenity_sprint','route_puzzle','ranking','detective','builder','multiplayer_trust'])if(!modes.includes(`'${mode}'`))failures.push(`Game Center missing distinct gameplay mode: ${mode}`);
 for(const rpc of ['record_game_result','list_game_challenge_targets','list_game_challenges','create_game_challenge','respond_game_challenge','record_game_challenge_score'])if(!service.includes(`rpc('${rpc}'`))failures.push(`Game Center service missing canonical RPC: ${rpc}`);
 if(!modes.includes('MEMORY_PAIRS')||!screen.includes('flipMemory'))failures.push('Bathroom Memory must use real pair matching.');
 if(!modes.includes('BUILDER_SCENARIOS')||!screen.includes('submitBuilder'))failures.push('Amenity Architect must use multi-select builder state.');
 if(!modes.includes('timeLimitSec')||!modes.includes('speedBonus')||!screen.includes('Time expired.')||!screen.includes('timerTrack'))failures.push('Timed game modes must enforce countdowns and speed scoring.');
 if(!modes.includes('strategyBudget')||!modes.includes('costs?:number[]')||!screen.includes('strategyTokens')||!screen.includes('Not enough evidence tokens'))failures.push('Stall Strategy must use a finite evidence budget.');
 if(!modes.includes('routeMetrics')||!screen.includes('routeMetrics')||!screen.includes('neededAmenity'))failures.push('Route to Relief must expose route tradeoff metrics.');
 if(!scoring.includes('scoreRound')||!scoring.includes("score_model:'mode_v2'")||!screen.includes('gameResultMetadata'))failures.push('Game Center must use the mode-specific scoring model.');
 if(!screen.includes('index===current.correct'))failures.push('Choice modes must score against the explicit canonical correct choice.');
 if(!screen.includes('recordGameResult')||!screen.includes('recordGameChallengeScore'))failures.push('Game scores must persist through canonical authorities.');
 if(!screen.includes('getMobileProgressionDashboard')||!screen.includes('listMobileBadges')||!screen.includes('progressionMessage'))failures.push('Game saves must surface canonical progression deltas.');
 if(!screen.includes("pathname:'/contributor/[id]'"))failures.push('Challenge players must link to contributor profiles.');
 if(!play.includes("router.push('/games')")||!layout.includes('<Tabs.Screen name="games" options={{ href: null }}/>'))failures.push('Game Center must remain beneath Play.');
 if(/\.from\(['"](?:game_results|game_challenges|point_transactions)['"]\)/.test(service+screen))failures.push('Game Center must not create a direct alternate scoring/challenge store.');
}
if(failures.length){console.error('Native game authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native game authority audit passed.');
