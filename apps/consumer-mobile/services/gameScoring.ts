import type { GameDefinition } from './gameModes';

export type RoundScoreInput={game:GameDefinition;correct:boolean;timeLeft?:number;strategyRemaining?:number};

export function scoreRound({game,correct,timeLeft=0,strategyRemaining=0}:RoundScoreInput){
  if(!correct)return 0;
  const base=Math.max(1,game.basePoints);
  const speed=game.timeLimitSec?Math.max(0,Math.min(game.speedBonus||0,Math.round((timeLeft/game.timeLimitSec)*(game.speedBonus||0)))):0;
  const strategy=game.mode==='strategy'?Math.max(0,strategyRemaining)*2:0;
  return base+speed+strategy;
}

export function gameResultMetadata(game:GameDefinition,rounds:number,extra:Record<string,unknown>={}){
  return {mode:game.mode,rounds,difficulty:game.difficulty,time_limit_sec:game.timeLimitSec||null,score_model:'mode_v2',...extra};
}
