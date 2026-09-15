import fs from 'node:fs';

const failures=[];
const modesPath='apps/consumer-mobile/services/gameModes.ts';
const source=fs.readFileSync(modesPath,'utf8');
const migrations=fs.readdirSync('supabase/migrations').sort().map(name=>fs.readFileSync('supabase/migrations/'+name,'utf8')).join('\n');
const latestGameAuthority=fs.readFileSync('supabase/migrations/20260913192500_game_center_score_records.sql','utf8');
const challengeStatusFix=fs.readFileSync('supabase/migrations/20260915162500_fix_game_challenge_status_ambiguity.sql','utf8');

const choiceModes=['evidence_tap','trust_quiz','rapid_fire','relay','strategy','amenity_sprint','route_puzzle','ranking','detective','multiplayer_trust'];
const gameDefs=[...source.matchAll(/\{code:'([^']+)',name:'([^']+)'[^\n]*?mode:'([^']+)'[^\n]*?rounds:(\d+)/g)]
  .map(m=>({code:m[1],name:m[2],mode:m[3],rounds:Number(m[4])}));

if(gameDefs.length<12)failures.push('Game catalog must retain all canonical games.');

if(!/export type ChoiceRound=\{id:string;/.test(source))failures.push('Every choice round must have a stable unique id.');

for(const game of gameDefs){
  if(choiceModes.includes(game.mode)){
    const start=source.indexOf(` ${game.mode}:[`);
    if(start<0){failures.push(`${game.name}: missing content pool`);continue}
    const later=choiceModes
      .map(mode=>source.indexOf(` ${mode}:[`,start+2))
      .filter(index=>index>start)
      .sort((a,b)=>a-b)[0] ?? source.indexOf('};\n\nexport const MEMORY_PAIRS',start);
    const block=source.slice(start,later>start?later:undefined);
    const ids=[...block.matchAll(/\bid:'([^']+)'/g)].map(m=>m[1]);
    if(ids.length<game.rounds)failures.push(`${game.name}: configured for ${game.rounds} rounds but only has ${ids.length} unique content ids`);
    if(new Set(ids).size!==ids.length)failures.push(`${game.name}: duplicate round ids found`);
  }
}

const memory=source.match(/export const MEMORY_PAIRS=\[(.*?)\];\s*export const BUILDER_SCENARIOS/s)?.[1]||'';
const memoryPairs=(memory.match(/\['/g)||[]).length;
const memoryGame=gameDefs.find(g=>g.mode==='memory');
if(memoryGame&&memoryPairs<memoryGame.rounds)failures.push(`Bathroom Memory: configured for ${memoryGame.rounds} pairs but only has ${memoryPairs}`);

const builders=source.match(/export const BUILDER_SCENARIOS=\[(.*?)\];\n\nexport function shuffleChoiceRound/s)?.[1]||'';
const builderCount=(builders.match(/\{id:'/g)||[]).length;
const builderGame=gameDefs.find(g=>g.mode==='builder');
if(builderGame&&builderCount<builderGame.rounds)failures.push(`Amenity Architect: configured for ${builderGame.rounds} rounds but only has ${builderCount} scenarios`);

if(!/values\(\s*v_user\s*,\s*'game_score'\s*,\s*'game'\s*,\s*v_game\.id/s.test(latestGameAuthority))failures.push("Game score persistence must use canonical progression source_type 'game'.");
if(/'game_score'\s*,\s*'progression_game'/.test(latestGameAuthority))failures.push("Latest game score authority must not write unsupported source_type 'progression_game'.");
if(!/update public\.game_challenges as gc[\s\S]*where gc\.status\s*=\s*'pending'/i.test(challengeStatusFix))failures.push('Game challenge listing must qualify status against the game_challenges table to avoid PL/pgSQL output-column ambiguity.');
if(!/c\.status\s*=\s*p_status/i.test(challengeStatusFix))failures.push('Game challenge status filter must remain qualified to the challenge row.');
const arenaPath='apps/consumer-mobile/app/game/[code].tsx';
const playPath='apps/consumer-mobile/app/play.tsx';
const hubPath='apps/consumer-mobile/app/games.tsx';
if(!fs.existsSync(arenaPath))failures.push('Game Center needs a dedicated per-game arena route.');
else{
  const arena=fs.readFileSync(arenaPath,'utf8');
  if(!arena.includes('getGameFreshnessProfile')||!arena.includes('freshRoundOrder')||!arena.includes('recordGameContentExposure'))failures.push('Game arena must use the freshness/exposure engine to reduce repetition across sessions.');
  if(!arena.includes('combo')||!arena.includes('bestScore'))failures.push('Game arena must expose replay goals beyond XP: combo and personal best.');
  for(const label of ['CLEAN SWEEP','SPEED RUN','CASE FILE','ROUTE BOARD','EVIDENCE BUDGET','TRUST BATTLE'])if(!arena.includes(label))failures.push('Game arena missing distinct presentation: '+label);
}
if(fs.existsSync(playPath)){
  const play=fs.readFileSync(playPath,'utf8');
  if(!play.includes("pathname:'/game/[code]'"))failures.push('Play game cards must launch dedicated game arenas.');
}
if(fs.existsSync(hubPath)){
  const hub=fs.readFileSync(hubPath,'utf8');
  if(!hub.includes("pathname:'/game/[code]'"))failures.push('Game Center hub must launch dedicated game arenas.');
}
const metaGame=fs.readFileSync('apps/consumer-mobile/services/engagementMetaGame.ts','utf8');
const progress=fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8');
const community=fs.readFileSync('apps/consumer-mobile/app/social.tsx','utf8');
if(!/KLEENEST_DIVISIONS/.test(metaGame)||!/KLEENEST LEAGUE/.test(progress))failures.push('Progression must expose the Kleenest League meta-game.');
if(!/COMMUNITY COMPETITION/.test(community))failures.push('Community must connect social play, rivals and league standing.');
if(!/ENGAGEMENT_SPONSOR_SURFACES=\['game_center','progress','community'\]/.test(metaGame))failures.push('Ad/sponsor eligibility must stay constrained to engagement surfaces.');

if(failures.length){
  console.error('Game content depth audit failed:');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Game content depth audit passed: every game has enough unique content for its advertised length and canonical score persistence.');
