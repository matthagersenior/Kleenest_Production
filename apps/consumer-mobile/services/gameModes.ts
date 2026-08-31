export type GameMode='evidence_tap'|'memory'|'trust_quiz'|'rapid_fire'|'relay'|'strategy'|'amenity_sprint'|'route_puzzle'|'ranking'|'detective'|'builder'|'multiplayer_trust';
export type GameDifficulty='easy'|'medium'|'hard';
export type GameDefinition={code:string;name:string;description:string;mode:GameMode;rounds:number;accent:string;instructions:string;basePoints:number;speedBonus?:number;timeLimitSec?:number;difficulty:GameDifficulty;strategyBudget?:number};

export const GAME_DEFINITIONS:GameDefinition[]=[
 {code:'clean_sweep',name:'Clean Sweep',description:'Sweep away weak evidence before it contaminates the trust set.',mode:'evidence_tap',rounds:12,accent:'🧹',instructions:'Tap only the evidence you would trust.',basePoints:10,difficulty:'easy'},
 {code:'bathroom_memory',name:'Bathroom Memory',description:'Match restroom amenities with the observations that verify them.',mode:'memory',rounds:6,accent:'🧠',instructions:'Find all six matching amenity pairs.',basePoints:18,difficulty:'easy'},
 {code:'trust_or_bust',name:'Trust or Bust',description:'Separate strong evidence from weak restroom claims.',mode:'trust_quiz',rounds:8,accent:'🛡️',instructions:'Choose the strongest answer.',basePoints:15,difficulty:'medium'},
 {code:'flush_the_facts',name:'Flush the Facts',description:'Rapid-fire fact or fluff decisions under a short clock.',mode:'rapid_fire',rounds:10,accent:'⚡',instructions:'Decide FACT or FLUFF before the clock expires.',basePoints:10,speedBonus:10,timeLimitSec:7,difficulty:'medium'},
 {code:'restroom_relay',name:'Restroom Relay',description:'Carry a verification baton through a complete restroom visit.',mode:'relay',rounds:8,accent:'🏃',instructions:'Complete each visit step in the strongest order.',basePoints:16,difficulty:'medium'},
 {code:'stall_strategy',name:'Stall Strategy',description:'Spend a limited evidence budget where it builds the most trust.',mode:'strategy',rounds:6,accent:'♟️',instructions:'Spend evidence tokens carefully. Stronger moves cost more.',basePoints:20,difficulty:'hard',strategyBudget:10},
 {code:'sink_sprint',name:'Sink Sprint',description:'Identify sink, soap, drying, and accessibility conditions at speed.',mode:'amenity_sprint',rounds:12,accent:'🚰',instructions:'Classify the amenity condition before the clock expires.',basePoints:9,speedBonus:9,timeLimitSec:5,difficulty:'easy'},
 {code:'route_to_relief',name:'Route to Relief',description:'Balance distance, freshness, accessibility, and verification to pick a stop.',mode:'route_puzzle',rounds:6,accent:'🗺️',instructions:'Pick the best stop, not merely the closest one.',basePoints:22,difficulty:'medium'},
 {code:'review_rater',name:'Review Rater',description:'Rank competing reviews by usefulness to the next visitor.',mode:'ranking',rounds:8,accent:'⭐',instructions:'Promote the most useful review to #1.',basePoints:20,difficulty:'medium'},
 {code:'evidence_detective',name:'Evidence Detective',description:'Investigate a restroom report and identify the clue that breaks trust.',mode:'detective',rounds:8,accent:'🔎',instructions:'Find the suspicious clue.',basePoints:24,difficulty:'hard'},
 {code:'amenity_architect',name:'Amenity Architect',description:'Build a complete restroom profile from a visitor scenario.',mode:'builder',rounds:6,accent:'🏗️',instructions:'Select every amenity the scenario actually supports.',basePoints:22,difficulty:'hard'},
 {code:'cleanliness_clash',name:'Cleanliness Clash',description:'Compare two evidence sets and choose which one wins the trust battle.',mode:'multiplayer_trust',rounds:8,accent:'⚔️',instructions:'Choose the stronger evidence set.',basePoints:25,difficulty:'hard'},
];

export type RouteMetric={label:string;distance:string;freshness:string;verified:boolean;accessible:boolean;neededAmenity?:boolean};
export type ChoiceRound={prompt:string;choices:string[];correct:number;detail:string;costs?:number[];routeMetrics?:RouteMetric[]};
export const MODE_ROUNDS:Record<Exclude<GameMode,'memory'|'builder'>,ChoiceRound[]>={
 evidence_tap:[
  {prompt:'Sweep the trustworthy tile',choices:['Verified check-in · soap missing','“Probably clean” · no visit','Copied listing text'],correct:0,detail:'Visit-linked observations are evidence.'},
  {prompt:'Sweep the trustworthy tile',choices:['Photo + recent check-in','Five stars · no details','Old anonymous claim'],correct:0,detail:'Fresh, attributable evidence wins.'},
  {prompt:'Sweep the trustworthy tile',choices:['Accessible stall observed today','Wheelchair icon guessed from name','No accessibility details'],correct:0,detail:'Observed accessibility beats assumptions.'}],
 trust_quiz:[
  {prompt:'Which signal is strongest?',choices:['Verified check-in + useful observation','Random rating with no visit','Copied description'],correct:0,detail:'Verification plus observation is strongest.'},
  {prompt:'Which detail helps the next visitor?',choices:['Soap unavailable at sink','Nice place','Three stars'],correct:0,detail:'Specific conditions are actionable.'}],
 rapid_fire:[
  {prompt:'“Soap dispenser empty, verified 8 minutes ago.”',choices:['FACT','FLUFF'],correct:0,detail:'Specific + recent + verified.'},
  {prompt:'“Best bathroom ever!!!”',choices:['FACT','FLUFF'],correct:1,detail:'Enthusiasm alone is not evidence.'},
  {prompt:'“Accessible entrance observed; stall rail present.”',choices:['FACT','FLUFF'],correct:0,detail:'Concrete accessibility observations matter.'}],
 relay:[
  {prompt:'START → What should come first?',choices:['Arrive + verify location','Write review from parking lot','Guess amenities'],correct:0,detail:'A trustworthy relay starts with a real visit.'},
  {prompt:'CHECK-IN → Pass the baton to…',choices:['Observe conditions','Copy an older review','Leave immediately'],correct:0,detail:'Observation connects presence to evidence.'},
  {prompt:'OBSERVE → Finish the leg with…',choices:['Specific review + evidence','Generic star only','Unrelated comment'],correct:0,detail:'The final handoff should help the next visitor.'}],
 strategy:[
  {prompt:'You have limited evidence tokens. Best investment?',choices:['Check-in + current photo','Two star ratings','Two old comments'],costs:[4,2,1],correct:0,detail:'Independent current signals reinforce each other.'},
  {prompt:'Spend the next evidence move.',choices:['Confirm accessibility fixture','Add another adjective','Repeat the star score'],costs:[3,1,1],correct:0,detail:'New facts beat duplicated opinion.'},
  {prompt:'One high-value move remains.',choices:['Verify the needed amenity now','Count total historical reviews','Copy business marketing text'],costs:[3,2,1],correct:0,detail:'Current need-specific evidence has the highest utility.'}],
 amenity_sprint:[
  {prompt:'Sink works; soap dispenser empty.',choices:['READY','NEEDS ATTENTION'],correct:1,detail:'The handwashing station is incomplete.'},
  {prompt:'Sink, soap, and dryer all working.',choices:['READY','NEEDS ATTENTION'],correct:0,detail:'Core sink amenities are available.'},
  {prompt:'Accessible sink blocked by storage.',choices:['READY','NEEDS ATTENTION'],correct:1,detail:'Present is not the same as usable.'}],
 route_puzzle:[
  {prompt:'Pick the strongest route stop',choices:['Oak & 3rd','Market Corner','Station Annex'],correct:0,detail:'A small distance tradeoff buys much stronger confidence.',routeMetrics:[{label:'Oak & 3rd',distance:'0.4 mi',freshness:'10m',verified:true,accessible:true},{label:'Market Corner',distance:'0.1 mi',freshness:'2y',verified:false,accessible:false},{label:'Station Annex',distance:'0.3 mi',freshness:'4mo',verified:false,accessible:true}]},
  {prompt:'You need a changing table.',choices:['Family Plaza','Quick Mart','Cafe South'],correct:0,detail:'Route utility depends on the amenity you need.',routeMetrics:[{label:'Family Plaza',distance:'0.5 mi',freshness:'today',verified:true,accessible:true,neededAmenity:true},{label:'Quick Mart',distance:'0.2 mi',freshness:'unknown',verified:false,accessible:false,neededAmenity:false},{label:'Cafe South',distance:'0.4 mi',freshness:'1y',verified:false,accessible:true,neededAmenity:false}]}],
 ranking:[
  {prompt:'Which review belongs at #1?',choices:['“Clean at 2:15 PM; soap stocked; verified visit.”','“5 stars”','“Seems okay.”'],correct:0,detail:'Useful reviews combine recency, specifics, and provenance.'},
  {prompt:'Promote the best accessibility review',choices:['“Ramp entry + grab rails observed today.”','“Probably accessible.”','“Nice building.”'],correct:0,detail:'Direct observation belongs first.'}],
 detective:[
  {prompt:'Case file: “Verified today · photo from 2023 · says spotless.” What breaks the chain?',choices:['The old photo','The verified visit','The timestamp'],correct:0,detail:'The photo does not support today’s condition.'},
  {prompt:'Case file: reviewer claims a changing table but never entered the restroom.',choices:['Unobserved amenity claim','Reviewer username','Location name'],correct:0,detail:'The claim lacks firsthand evidence.'}],
 multiplayer_trust:[
  {prompt:'Evidence Set A vs B',choices:['A · check-in + photo + amenity observation','B · two unsupported 5-star ratings'],correct:0,detail:'Multiple visit-linked signals beat unsupported popularity.'},
  {prompt:'Cleanliness evidence showdown',choices:['A · “clean” from last year','B · verified today + dry floor + stocked soap'],correct:1,detail:'Fresh specifics win the clash.'}],
};

export const MEMORY_PAIRS=[['Soap','Stocked dispenser'],['Dryer','Working hand dryer'],['Accessible','Grab rails'],['Changing','Changing table'],['Sink','Running water'],['Privacy','Working stall lock']];
export const BUILDER_SCENARIOS=[
 {prompt:'Family stop: verified changing table, working sink, stocked soap. No accessibility observation.',options:['Changing table','Working sink','Soap stocked','Accessible stall'],correct:[0,1,2]},
 {prompt:'Accessible visit: step-free entrance, grab rails, working sink. Dryer was broken.',options:['Step-free entrance','Grab rails','Working sink','Working dryer'],correct:[0,1,2]},
 {prompt:'Quick stop: stall lock works, soap stocked, dryer works. Changing table not observed.',options:['Working lock','Soap stocked','Working dryer','Changing table'],correct:[0,1,2]},
];

export function roundsFor(game:GameDefinition){return MODE_ROUNDS[game.mode as keyof typeof MODE_ROUNDS]||[];}
