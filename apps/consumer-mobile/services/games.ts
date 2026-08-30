import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export type QuizQuestion={prompt:string;options:string[];correctIndex:number};
export const QUIZ_GAMES=[
  {code:'trust_or_bust',name:'Trust or Bust',description:'Separate strong evidence from weak signals.'},
  {code:'flush_the_facts',name:'Flush the Facts',description:'Make fast decisions about useful reviews.'},
  {code:'restroom_relay',name:'Restroom Relay',description:'Race through cleanliness and accessibility decisions.'},
  {code:'route_to_relief',name:'Route to Relief',description:'Choose the strongest restroom stop.'},
  {code:'review_rater',name:'Review Rater',description:'Rank what a traveler actually needs.'},
  {code:'evidence_detective',name:'Evidence Detective',description:'Spot clues that make a rating trustworthy.'},
  {code:'cleanliness_clash',name:'Cleanliness Clash',description:'Challenge someone to identify stronger evidence.'},
];
export const QUESTIONS:QuizQuestion[]=[
  {prompt:'Which signal is strongest for a trustworthy restroom review?',options:['Verified check-in plus useful observation','A random rating with no visit','A copied description'],correctIndex:0},
  {prompt:'Which detail helps the next visitor most?',options:['Specific cleanliness and amenity facts','Only a star number','Only a joke'],correctIndex:0},
  {prompt:'What makes a review more useful over time?',options:['Recent, visit-linked evidence','An old unsupported claim','No location context'],correctIndex:0},
  {prompt:'Which restroom fact is most actionable?',options:['Soap unavailable at the sink','It felt weird','Nice place'],correctIndex:0},
  {prompt:'What should a trust-focused game reward?',options:['Accurate evidence and useful contribution','Spammy ratings','Repeated taps with no context'],correctIndex:0},
  {prompt:'What is the best accessibility signal?',options:['Observed accessible entrance or fixture details','A guess from the building name','No information'],correctIndex:0},
  {prompt:'Which combination is strongest?',options:['Check-in + observation + review','Review only','Photo caption only'],correctIndex:0},
  {prompt:'What should a route recommendation prioritize?',options:['Trustworthy nearby evidence and usable amenities','Popularity alone','Random selection'],correctIndex:0},
];
export function shuffledQuestion(question:QuizQuestion){const options=question.options.map((text,index)=>({text,index}));for(let i=options.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}return{prompt:question.prompt,options,correctIndex:question.correctIndex};}
export async function recordGameResult(gameCode:string,score:number,durationMs:number,metadata:any={}){const{data,error}=await getKleenestSupabaseClient().rpc('record_game_result',{p_game_code:gameCode,p_score:Math.max(0,Math.round(score)),p_duration_ms:Math.max(0,Math.round(durationMs)),p_metadata:metadata});if(error)throw error;return data;}
export async function listGameChallengeTargets(limit=30){const{data,error}=await getKleenestSupabaseClient().rpc('list_game_challenge_targets',{p_limit:Math.min(Math.max(limit,1),100)});if(error)throw error;return data||[];}
export async function listGameChallenges(status:string|null=null,limit=30){const{data,error}=await getKleenestSupabaseClient().rpc('list_game_challenges',{p_status:status,p_limit:Math.min(Math.max(limit,1),100)});if(error)throw error;return data||[];}
export async function createGameChallenge(gameCode:string,inviteeId:string){const{data,error}=await getKleenestSupabaseClient().rpc('create_game_challenge',{p_game_code:gameCode,p_invitee_id:inviteeId,p_metadata:{focus:'bathroom_trust'}});if(error)throw error;return data;}
export async function respondGameChallenge(challengeId:string,accept:boolean){const{data,error}=await getKleenestSupabaseClient().rpc('respond_game_challenge',{p_challenge_id:challengeId,p_accept:accept});if(error)throw error;return data;}
export async function recordGameChallengeScore(challengeId:string,score:number,rounds:number){const{data,error}=await getKleenestSupabaseClient().rpc('record_game_challenge_score',{p_challenge_id:challengeId,p_score:Math.max(0,Math.round(score)),p_metadata:{rounds,focus:'bathroom_trust'}});if(error)throw error;return data;}
