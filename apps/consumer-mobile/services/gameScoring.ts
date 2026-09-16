import type { GameDefinition } from './gameModes';

export type RoundScoreInput={game:GameDefinition;correct:boolean;timeLeft?:number;strategyRemaining?:number;combo?:number;lives?:number};

export function scoreRound({game,correct,timeLeft=0,strategyRemaining=0,combo=0,lives=0}:RoundScoreInput){
  if(!correct)return 0;
  const base=Math.max(1,game.basePoints);
  const speed=game.timeLimitSec?Math.max(0,Math.min(game.speedBonus||0,Math.round((timeLeft/game.timeLimitSec)*(game.speedBonus||0)))):0;
  const strategy=game.mode==='strategy'?Math.max(0,strategyRemaining):0;
  const comboBonus=Math.min(20,Math.max(0,combo))*Math.max(1,Math.round(base*.12));
  const survivalBonus=['evidence_tap','detective','multiplayer_trust','tower_defense'].includes(game.mode)?Math.max(0,lives-1):0;
  return base+speed+strategy+comboBonus+survivalBonus;
}

export function masteryRating(input:{score:number;bestScore:number;correct:number;rounds:number;maxCombo:number}){
  const accuracy=input.rounds?input.correct/input.rounds:0;
  const best=Math.max(input.bestScore,input.score,1);
  const scoreRatio=input.score/best;
  const mastery=Math.round(Math.min(100,(accuracy*.65+Math.min(1,scoreRatio)*.2+Math.min(1,input.maxCombo/8)*.15)*100));
  return mastery>=95?'ELITE':mastery>=85?'MASTER':mastery>=70?'EXPERT':mastery>=50?'SKILLED':'ROOKIE';
}

export function gameResultMetadata(game:GameDefinition,rounds:number,extra:Record<string,unknown>={}){
  const advanced=['flow_builder','stack_sort','tower_defense','route_rush'].includes(game.mode);
  return {mode:game.mode,rounds,difficulty:game.difficulty,time_limit_sec:game.timeLimitSec||null,score_model:advanced?'arena_v4':'arena_v3',...extra};
}
