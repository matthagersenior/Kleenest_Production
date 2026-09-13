import fs from 'node:fs';

const modePath='apps/consumer-mobile/services/gameModes.ts';
const servicePath='apps/consumer-mobile/services/games.ts';
const scoringPath='apps/consumer-mobile/services/gameScoring.ts';
const hubPath='apps/consumer-mobile/app/games.tsx';
const arenaPath='apps/consumer-mobile/app/game/[code].tsx';
const playPath='apps/consumer-mobile/app/play.tsx';
const layoutPath='apps/consumer-mobile/app/_layout.tsx';
const failures=[];
for(const file of [modePath,servicePath,scoringPath,hubPath,arenaPath,playPath,layoutPath])if(!fs.existsSync(file))failures.push('missing mobile Game Center file: '+file);

if(!failures.length){
 const modes=fs.readFileSync(modePath,'utf8');
 const service=fs.readFileSync(servicePath,'utf8');
 const scoring=fs.readFileSync(scoringPath,'utf8');
 const hub=fs.readFileSync(hubPath,'utf8');
 const arena=fs.readFileSync(arenaPath,'utf8');
 const play=fs.readFileSync(playPath,'utf8');
 const layout=fs.readFileSync(layoutPath,'utf8');
 const migrations=fs.readdirSync('supabase/migrations').sort().map(name=>fs.readFileSync('supabase/migrations/'+name,'utf8')).join('\n');

 const codes=['clean_sweep','bathroom_memory','trust_or_bust','flush_the_facts','restroom_relay','stall_strategy','sink_sprint','route_to_relief','review_rater','evidence_detective','amenity_architect','cleanliness_clash'];
 for(const code of codes)if(!modes.includes("code:'"+code+"'")||!migrations.includes("'"+code+"'"))failures.push('Game Center missing canonical game authority: '+code);
 for(const mode of ['evidence_tap','memory','trust_quiz','rapid_fire','relay','strategy','amenity_sprint','route_puzzle','ranking','detective','builder','multiplayer_trust'])if(!modes.includes("'"+mode+"'"))failures.push('Game Center missing distinct gameplay mode: '+mode);
 for(const rpc of ['record_game_result','game_freshness_profile','record_game_content_exposure','get_game_personal_record','list_game_challenge_targets','list_game_challenges','create_game_challenge','respond_game_challenge','record_game_challenge_score'])if(!service.includes("rpc('"+rpc+"'"))failures.push('Game Center service missing canonical RPC: '+rpc);

 if(!modes.includes('MEMORY_PAIRS')||!arena.includes('flipMemory')||!arena.includes('memoryMatched'))failures.push('Bathroom Memory must use real pair matching.');
 if(!modes.includes('BUILDER_SCENARIOS')||!arena.includes('submitBuilder')||!arena.includes('builderSelected'))failures.push('Amenity Architect must use multi-select builder state.');
 if(!modes.includes('timeLimitSec')||!modes.includes('speedBonus')||!arena.includes('Time expired.')||!arena.includes('timeLeft')||!arena.includes('effectiveLimit'))failures.push('Timed game modes must enforce countdowns and speed scoring.');
 if(!modes.includes('strategyBudget:20')||!modes.includes('costs?:number[]')||!arena.includes('strategyTokens')||!arena.includes('Not enough evidence tokens'))failures.push('Stall Strategy must use a completable finite evidence budget.');
 if(!modes.includes('routeMetrics')||!arena.includes('routeMetrics')||!arena.includes('neededAmenity'))failures.push('Route to Relief must expose route tradeoff metrics.');
 if(!scoring.includes('scoreRound')||!scoring.includes("score_model:'arena_v3'")||!arena.includes('gameResultMetadata')||!arena.includes('masteryRating'))failures.push('Game Center must use arena_v3 mode-specific scoring and mastery.');
 if(!arena.includes('index===current.correct'))failures.push('Choice modes must score against the explicit canonical correct choice.');
 if(!/export function shuffleChoiceRound\(/.test(modes)||!modes.includes('Math.floor(random()*(i+1))')||!modes.includes('permutation.indexOf(round.correct)'))failures.push('Choice rounds must randomize answer order with Fisher-Yates and remap the canonical correct index.');
 if(!modes.includes('round.costs?permutation.map')||!modes.includes('round.routeMetrics?permutation.map'))failures.push('Choice-round randomization must keep strategy costs and route metrics aligned with their answers.');
 if(!arena.includes('freshRoundOrder')||!arena.includes('setSessionRounds')||!arena.includes('.map(row=>shuffleChoiceRound(row))'))failures.push('Game arenas must prepare one stable freshness-aware randomized order per session.');
 if(!arena.includes('recordGameContentExposure')||!arena.includes('getGameFreshnessProfile'))failures.push('Game arenas must track exposure and prefer fresh content across sessions.');
 if(!arena.includes('recordGameResult')||!arena.includes('recordGameChallengeScore'))failures.push('Solo and challenge scores must persist through canonical authorities.');
 if(!arena.includes('getMobileProgressionDashboard')||!arena.includes('listMobileBadges')||!arena.includes('progressionMessage'))failures.push('Game saves must surface canonical progression deltas.');
 if(!arena.includes("pathname:'/contributor/[id]'"))failures.push('Challenge players must link to contributor profiles.');
 if(!hub.includes("pathname:'/game/[code]'")||!hub.includes('params:{code:game.code}'))failures.push('Game Center cards must deep-link the selected canonical game arena.');
 if(!play.includes("pathname:'/game/[code]'")||!play.includes('params:{code:game.code}'))failures.push('Play Game Center cards must deep-link the selected canonical game arena.');
 if(!arena.includes('useLocalSearchParams')||!arena.includes('g.code===code'))failures.push('Game arenas must honor the selected canonical game code instead of defaulting every launch.');
 if(!new RegExp("name=[\"']games[\"'][^>]*href:\\s*null").test(layout)||!new RegExp("name=[\"']game/\\[code\\][\"'][^>]*href:\\s*null").test(layout))failures.push('Game hub and per-game arena must remain hidden secondary routes beneath Play.');

 if(!migrations.includes("set search_path = ''")||!migrations.includes('v_score:=least(v_raw_score,v_max_score)')||!migrations.includes('safe_score:=least(raw_score,max_score)'))failures.push('Solo and challenge score authorities must clamp scores with empty search paths.');
 if(!migrations.includes("values(\n   v_user,'game_score','game',v_game.id")&&!migrations.includes("values(v_user,'game_score','game',v_game.id"))failures.push("Game score persistence must use canonical progression source_type 'game'.");
 if(!migrations.includes("revoke all on function public.record_game_result(text,integer,integer,jsonb) from public,anon")||!migrations.includes("revoke all on function public.record_game_challenge_score(uuid,integer,jsonb) from public,anon"))failures.push('Game score authorities must deny anonymous execution.');
 if(!migrations.includes("'score_model','arena_v3'"))failures.push('Challenge score authority must converge to arena_v3 metadata.');
 if(/\.from\(['"](?:game_results|game_challenges|point_transactions)['"]\)/.test(service+arena+hub))failures.push('Game Center must not create a direct alternate scoring/challenge store.');
}

if(failures.length){console.error('Native game authority audit failed:');for(const failure of failures)console.error('- '+failure);process.exit(1)}
console.log('Native game authority audit passed for dedicated arenas, freshness, mastery, progression and challenges.');
