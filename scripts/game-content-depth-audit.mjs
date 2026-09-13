import fs from 'node:fs';

const failures=[];
const modesPath='apps/consumer-mobile/services/gameModes.ts';
const screenPath='apps/consumer-mobile/app/games.tsx';
const source=fs.readFileSync(modesPath,'utf8');
const screen=fs.readFileSync(screenPath,'utf8');
const migrations=fs.readdirSync('supabase/migrations').sort().map(name=>fs.readFileSync('supabase/migrations/'+name,'utf8')).join('\n');

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

const memory=source.match(/export const MEMORY_PAIRS=\[(.*?)\];\nexport const BUILDER_SCENARIOS/s)?.[1]||'';
const memoryPairs=(memory.match(/\['/g)||[]).length;
const memoryGame=gameDefs.find(g=>g.mode==='memory');
if(memoryGame&&memoryPairs<memoryGame.rounds)failures.push(`Bathroom Memory: configured for ${memoryGame.rounds} pairs but only has ${memoryPairs}`);

const builders=source.match(/export const BUILDER_SCENARIOS=\[(.*?)\];\n\nexport function shuffleChoiceRound/s)?.[1]||'';
const builderCount=(builders.match(/\{id:'/g)||[]).length;
const builderGame=gameDefs.find(g=>g.mode==='builder');
if(builderGame&&builderCount<builderGame.rounds)failures.push(`Amenity Architect: configured for ${builderGame.rounds} rounds but only has ${builderCount} scenarios`);

if(!/values\(v_user,'game_score','game',v_game\.id/.test(migrations))failures.push("Game score persistence must use canonical progression source_type 'game'.");
if(/values\(v_user,'game_score','progression_game'/.test(migrations.split('20260913').at(-1)||''))failures.push("Latest game score authority must not write unsupported source_type 'progression_game'.");
if(!screen.includes('Round ')||!screen.includes('game.rounds'))failures.push('Game screen must make round progression visible to the player.');

if(failures.length){
  console.error('Game content depth audit failed:');
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Game content depth audit passed: every game has enough unique content for its advertised length and canonical score persistence.');
