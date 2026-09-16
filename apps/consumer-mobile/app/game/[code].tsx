import { getMobileProgressionDashboard, listMobileBadges } from '@kleenest/mobile-core';
import { router,useLocalSearchParams } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View } from 'react-native';
import { BUILDER_SCENARIOS,GAME_DEFINITIONS,MEMORY_PAIRS,roundsFor,shuffleChoiceRound,type ChoiceRound } from '../../services/gameModes';
import { useConsumerTheme } from '../../services/theme';
import { createGameChallenge,freshRoundOrder,getGameFreshnessProfile,getGamePersonalRecord,listGameChallengeTargets,recordGameChallengeScore,recordGameContentExposure,recordGameResult } from '../../services/games';
import { gameResultMetadata,masteryRating,scoreRound } from '../../services/gameScoring';

const shuffle=<T,>(items:T[])=>[...items].sort(()=>Math.random()-.5);
const ARENA:Record<string,{label:string;tagline:string;glyph:string;surface:string;accent:string;soft:string}>={
 clean_sweep:{label:'CLEAN SWEEP',tagline:'Three strikes. Sweep weak evidence before it contaminates trust.',glyph:'🧹',surface:'#173d2b',accent:'#f0d17d',soft:'#edf5ef'},
 bathroom_memory:{label:'MEMORY GRID',tagline:'Match the restroom condition to the evidence that proves it.',glyph:'🧠',surface:'#314565',accent:'#bed7ff',soft:'#edf3fb'},
 trust_or_bust:{label:'TRUST TRIAL',tagline:'The evidence gets harder. Keep choosing what deserves belief.',glyph:'🛡️',surface:'#4a3b62',accent:'#d8c4ff',soft:'#f3eef8'},
 flush_the_facts:{label:'SPEED RUN',tagline:'Fact or fluff. The clock gets meaner as the run heats up.',glyph:'⚡',surface:'#77421d',accent:'#ffd28d',soft:'#fbf1e7'},
 restroom_relay:{label:'RELAY RUN',tagline:'Carry one trustworthy visit through the whole evidence chain.',glyph:'🏃',surface:'#24566a',accent:'#a9e1ef',soft:'#eaf5f8'},
 stall_strategy:{label:'EVIDENCE BUDGET',tagline:'You cannot verify everything. Spend where uncertainty matters most.',glyph:'♟️',surface:'#253545',accent:'#c7d5e5',soft:'#eef2f5'},
 sink_sprint:{label:'SPEED RUN',tagline:'Ready or needs attention. Make the call before time disappears.',glyph:'🚰',surface:'#0f6170',accent:'#a8ecf4',soft:'#e7f7f9'},
 route_to_relief:{label:'ROUTE BOARD',tagline:'Distance is only one cost. Route for confidence, access and need.',glyph:'🗺️',surface:'#31583d',accent:'#c8efcf',soft:'#edf6ef'},
 review_rater:{label:'RANKING ROOM',tagline:'Put the most useful review on top. Popularity is not the same as proof.',glyph:'⭐',surface:'#695215',accent:'#ffe69a',soft:'#faf6e6'},
 evidence_detective:{label:'CASE FILE',tagline:'Find the broken link before the case burns one of your lives.',glyph:'🔎',surface:'#442f2f',accent:'#ffc2b9',soft:'#faeeee'},
 amenity_architect:{label:'BUILD LAB',tagline:'Build the profile from observed facts—and nothing else.',glyph:'🏗️',surface:'#4c4a26',accent:'#e9e397',soft:'#f7f6e9'},
 cleanliness_clash:{label:'TRUST BATTLE',tagline:'Two evidence sets enter. One deserves the trust.',glyph:'⚔️',surface:'#542c46',accent:'#f5b9dc',soft:'#faedf5'},
 freshness_flow:{label:'FLOW GRID',tagline:'Build a living evidence chain and keep every node connected to proof.',glyph:'〰️',surface:'#173f46',accent:'#7ce6d8',soft:'#e8f7f5'},
 signal_stack:{label:'SIGNAL STACK',tagline:'Build upward. Weak evidence destabilizes the whole trust stack.',glyph:'▤',surface:'#3e3a24',accent:'#f0d06d',soft:'#f8f4e6'},
 trust_tower:{label:'TRUST TOWER',tagline:'Defend confidence from stale, vague and unsupported evidence waves.',glyph:'🏰',surface:'#3d2747',accent:'#d9a8ef',soft:'#f5ebf8'},
 route_rush:{label:'ROUTE RUSH',tagline:'Read the route board, commit fast, and protect the traveler from bad stops.',glyph:'🏁',surface:'#193f5b',accent:'#8bd7ff',soft:'#e9f5fb'},
};

async function progressionSnapshot(){
 const[dashboard,badges]=await Promise.all([getMobileProgressionDashboard().catch(()=>({})),listMobileBadges().catch(()=>[])]);
 return{dashboard,badgeCount:badges.length};
}
function progressionMessage(before:any,after:any,base:string){
 const points=Math.max(0,Number(after.dashboard?.points||0)-Number(before.dashboard?.points||0));
 const beforeLevel=Number(before.dashboard?.level||1),afterLevel=Number(after.dashboard?.level||1);
 const badges=Math.max(0,Number(after.badgeCount||0)-Number(before.badgeCount||0));
 const rewards=[points?'+'+points+' progression points':null,afterLevel>beforeLevel?'Level '+afterLevel+' unlocked':null,badges?badges+' new badge'+(badges===1?'':'s'):null].filter(Boolean);
 return rewards.length?base+' '+rewards.join(' · '):base;
}

export default function GameArena(){
 const params=useLocalSearchParams<{code?:string|string[];challengeId?:string|string[]}>();
 const code=Array.isArray(params.code)?params.code[0]:params.code;
 const challengeId=Array.isArray(params.challengeId)?params.challengeId[0]:params.challengeId;
 const game=GAME_DEFINITIONS.find(g=>g.code===code)||GAME_DEFINITIONS[0];
 const ui=useConsumerTheme('game');
 const arena=ARENA[game.code]||ARENA.clean_sweep;
 const[sessionRounds,setSessionRounds]=useState<ChoiceRound[]>([]);
 const[round,setRound]=useState(0),[score,setScore]=useState(0),[correctCount,setCorrectCount]=useState(0);
 const[combo,setCombo]=useState(0),[maxCombo,setMaxCombo]=useState(0),[lives,setLives]=useState(3);
 const[timeLeft,setTimeLeft]=useState(game.timeLimitSec||0),[strategyTokens,setStrategyTokens]=useState(game.strategyBudget||0);
 const[message,setMessage]=useState(game.instructions),[saved,setSaved]=useState(false),[startedAt,setStartedAt]=useState(Date.now()),[roundStartedAt,setRoundStartedAt]=useState(Date.now());
 const[record,setRecord]=useState<any>({}),[loading,setLoading]=useState(true),[targets,setTargets]=useState<any[]>([]),[challengeMessage,setChallengeMessage]=useState('');
 const[memoryCards,setMemoryCards]=useState<any[]>([]),[memoryOpen,setMemoryOpen]=useState<number[]>([]),[memoryMatched,setMemoryMatched]=useState<number[]>([]),[memoryMoves,setMemoryMoves]=useState(0);
 const[builderOrder,setBuilderOrder]=useState<any[]>([]),[builderSelected,setBuilderSelected]=useState<number[]>([]);

 const usesLives=['evidence_tap','detective','tower_defense'].includes(game.mode);
 const current=sessionRounds[round]||null;
 const builder=builderOrder[round]||null;
 const memoryDone=game.mode==='memory'&&memoryCards.length>0&&memoryMatched.length===memoryCards.length;
 const complete=memoryDone||round>=game.rounds||(usesLives&&lives<=0);
 const accuracy=round?Math.round((correctCount/round)*100):100;
 const mastery=masteryRating({score,bestScore:Number(record?.best_score||0),correct:correctCount,rounds:Math.max(1,round),maxCombo});
 const heat=round<Math.ceil(game.rounds/3)?'WARMUP':round<Math.ceil(game.rounds*.7)?'PRESSURE':'HARD MODE';
 const effectiveLimit=game.timeLimitSec?Math.max(3,(game.timeLimitSec||0)-Math.floor(round/4)):0;

 async function prepare(){
  setLoading(true);
  try{
   const[profile,personal,nextTargets]=await Promise.all([getGameFreshnessProfile(game.code,30).catch(()=>({})),getGamePersonalRecord(game.code).catch(()=>({})),listGameChallengeTargets(12).catch(()=>[])]);
   setRecord(personal||{});setTargets(nextTargets||[]);
   const ordered=freshRoundOrder(roundsFor(game),profile).slice(0,game.rounds).map(row=>shuffleChoiceRound(row));
   setSessionRounds(ordered);
   setBuilderOrder(shuffle(BUILDER_SCENARIOS).slice(0,game.rounds));
   const cards=shuffle(MEMORY_PAIRS.slice(0,game.rounds).flatMap((pair,pairId)=>pair.map((text,side)=>({pairId,text,side}))));
   setMemoryCards(cards);
  }finally{setLoading(false)}
 }
 function reset(){
  setRound(0);setScore(0);setCorrectCount(0);setCombo(0);setMaxCombo(0);setLives(3);setSaved(false);setStartedAt(Date.now());setRoundStartedAt(Date.now());
  setTimeLeft(game.timeLimitSec||0);setStrategyTokens(game.strategyBudget||0);setMemoryOpen([]);setMemoryMatched([]);setMemoryMoves(0);setBuilderSelected([]);setMessage(game.instructions);
  void prepare();
 }
 useEffect(()=>{reset()},[game.code]);

 function exposure(row:ChoiceRound|any,correct:boolean,answerKey:string){
  void recordGameContentExposure({
   gameCode:game.code,contentKey:String(row?.id||row?.prompt||game.code+'-'+round),topic:game.mode,mechanic:game.mode,
   answerKey,correct,responseMs:Math.max(0,Date.now()-roundStartedAt),informationValue:correct?1:.25,
   metadata:{round:round+1,combo,heat},
  }).catch(()=>{});
 }
 function advance(correct:boolean,detail:string,points?:number,row:any=current,answerKey=''){
  const nextCombo=correct?combo+1:0;
  const nextLives=usesLives&&!correct?Math.max(0,lives-1):lives;
  const gained=points??scoreRound({game,correct,timeLeft,strategyRemaining:strategyTokens,combo:nextCombo,lives:nextLives});
  if(correct){setCorrectCount(v=>v+1);setCombo(nextCombo);setMaxCombo(v=>Math.max(v,nextCombo));}else{setCombo(0);if(usesLives)setLives(nextLives);}
  if(gained>0)setScore(v=>v+gained);
  if(row)exposure(row,correct,answerKey);
  const strike=usesLives&&!correct?' · '+nextLives+' '+(nextLives===1?'life':'lives')+' left':'';
  const streak=correct&&nextCombo>=2?' · '+nextCombo+'× combo':'';
  setMessage((correct?'✓ ':'✕ ')+detail+(gained>0?' +'+gained:'')+streak+strike);
  setRound(v=>v+1);setBuilderSelected([]);setTimeLeft(effectiveLimit||game.timeLimitSec||0);setRoundStartedAt(Date.now());
 }

 useEffect(()=>{
  if(!game.timeLimitSec||loading||saved||complete)return;
  setTimeLeft(effectiveLimit);
  const id=setInterval(()=>setTimeLeft(v=>{if(v<=1){clearInterval(id);setTimeout(()=>advance(false,'Time expired.',0,current,'timeout'),0);return 0}return v-1}),1000);
  return()=>clearInterval(id);
 },[game.code,round,loading,saved,complete]);

 function answer(index:number){
  if(saved||!current||complete)return;
  const cost=current.costs?.[index]||0;
  if(game.mode==='strategy'){
   if(cost>strategyTokens){setMessage('Not enough evidence tokens. You have '+strategyTokens+'.');return}
   const remaining=strategyTokens-cost;setStrategyTokens(remaining);
   const correct=index===current.correct;
   advance(correct,current.detail,scoreRound({game,correct,strategyRemaining:remaining,combo:correct?combo+1:0}),current,current.choices[index]);
   return;
  }
  advance(index===current.correct,current.detail,undefined,current,current.choices[index]);
 }
 function toggleBuilder(index:number){if(!complete)setBuilderSelected(v=>v.includes(index)?v.filter(x=>x!==index):[...v,index]);}
 function submitBuilder(){
  if(!builder||complete)return;
  const a=[...builderSelected].sort().join(','),b=[...builder.correct].sort().join(','),correct=a===b;
  const pseudo={id:builder.id,prompt:builder.prompt,choices:builder.options};
  advance(correct,'Build only what the visit actually proves.',scoreRound({game,correct,combo:correct?combo+1:0}),pseudo,builderSelected.map(i=>builder.options[i]).join('|'));
 }
 function flipMemory(index:number){
  if(saved||memoryOpen.includes(index)||memoryMatched.includes(index)||memoryOpen.length>=2||complete)return;
  const open=[...memoryOpen,index];setMemoryOpen(open);
  if(open.length===2){
   setMemoryMoves(v=>v+1);
   const[a,b]=open,match=memoryCards[a].pairId===memoryCards[b].pairId;
   if(match){
    const nextCombo=combo+1,gained=scoreRound({game,correct:true,combo:nextCombo});
    setMemoryMatched(v=>[...v,a,b]);setScore(v=>v+gained);setCorrectCount(v=>v+1);setCombo(nextCombo);setMaxCombo(v=>Math.max(v,nextCombo));setRound(v=>v+1);
    setMessage('✓ Match found. +'+gained+(nextCombo>=2?' · '+nextCombo+'× combo':''));setMemoryOpen([]);setRoundStartedAt(Date.now());
    void recordGameContentExposure({gameCode:game.code,contentKey:'memory-pair-'+memoryCards[a].pairId,topic:'memory',mechanic:'memory',answerKey:memoryCards[a].text+'|'+memoryCards[b].text,correct:true,responseMs:Date.now()-roundStartedAt,informationValue:1,metadata:{moves:memoryMoves+1}}).catch(()=>{});
   }else{setCombo(0);setMessage('✕ Not a pair. Remember both positions.');setTimeout(()=>setMemoryOpen([]),650);}
  }
 }
 async function save(){
  if(saved||round===0||!complete)return;
  try{
   const before=await progressionSnapshot();
   const metadata=gameResultMetadata(game,round,{correct:correctCount,accuracy,max_combo:maxCombo,lives_remaining:lives,memory_moves:memoryMoves,strategy_remaining:strategyTokens,mastery,focus:'bathroom_trust'});
   let personalBest=false;
   if(challengeId){
    await recordGameChallengeScore(String(challengeId),score,round);
    const nextRecord=await getGamePersonalRecord(game.code).catch(()=>({}));
    personalBest=Number(nextRecord?.best_score||0)>Number(record?.best_score||0);
    setRecord(nextRecord||{});
   }else{
    const result=await recordGameResult(game.code,score,Date.now()-startedAt,metadata);
    personalBest=Boolean(result?.personal_best);
    setRecord((v:any)=>({...v,best_score:Math.max(Number(v?.best_score||0),score),plays:Number(v?.plays||0)+1}));
   }
   const after=await progressionSnapshot();
   setSaved(true);
   const best=personalBest?' · NEW PERSONAL BEST':'';
   setMessage(progressionMessage(before,after,(challengeId?'Challenge score submitted.':'Run saved.')+best));
  }catch(error:any){setMessage(error?.message||'Score could not be saved.')}
 }

 const bestScore=Math.max(Number(record?.best_score||0),saved?score:0);
 if(loading)return <SafeAreaView style={[s.safe,{backgroundColor:ui.canvas}]}><View style={s.loading}><Text style={s.loadingGlyph}>{arena.glyph}</Text><Text style={[s.loadingText,{color:ui.ink}]}>Building a fresh {game.name} run…</Text></View></SafeAreaView>;

 return <SafeAreaView style={[s.safe,{backgroundColor:ui.canvas}]}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
  <View style={[s.hero,{backgroundColor:arena.surface}]}>
   <View style={s.topRow}><Pressable accessibilityRole="button" accessibilityLabel="Back to Arcade" onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹ ARCADE</Text></Pressable><Text style={[s.arenaLabel,{color:arena.accent}]}>{arena.label}</Text></View>
   <Text style={s.glyph}>{arena.glyph}</Text><Text style={s.title}>{game.name}</Text><Text style={s.tagline}>{arena.tagline}</Text>
   <View style={s.hud}><Hud value={score} label="SCORE"/><Hud value={bestScore} label="BEST"/><Hud value={maxCombo+'×'} label="MAX COMBO"/><Hud value={accuracy+'%'} label="ACCURACY"/></View>
   <View style={s.roundTrack}><View style={[s.roundFill,{width:(String(Math.min(100,Math.round((round/Math.max(1,game.rounds))*100)))+'%') as any,backgroundColor:arena.accent}]} /></View>
   <View style={s.heatRow}><Text style={[s.heat,{color:arena.accent}]}>{heat}</Text><Text style={s.heroMeta}>Round {Math.min(round+1,game.rounds)} / {game.rounds}</Text>{usesLives?<Text style={s.heroMeta}>{'♥'.repeat(lives)}{'♡'.repeat(Math.max(0,3-lives))}</Text>:null}{game.timeLimitSec&&!complete?<Text style={[s.clock,{color:arena.accent}]}>{timeLeft}s</Text>:null}</View>
  </View>

  {game.mode==='strategy'?<View style={[s.resourceCard,{backgroundColor:ui.surface,borderColor:ui.line}]}><Text style={[s.resourceLabel,{color:ui.muted}]}>EVIDENCE BUDGET</Text><Text style={[s.resourceValue,{color:ui.ink}]}>{strategyTokens}</Text><Text style={[s.resourceBody,{color:ui.muted}]}>tokens left · stronger verification moves cost more</Text></View>:null}

  <View style={[s.arenaCard,{backgroundColor:ui.surface,borderColor:ui.line}]}>
   <View style={s.challengeHead}><Text style={[s.challengeKicker,{color:ui.muted}]}>{arena.label} · {game.difficulty.toUpperCase()}</Text><Text style={[s.combo,{color:ui.warning}]}>{combo>=2?combo+'× COMBO':'BUILD A COMBO'}</Text></View>
   {complete?<Results/>:game.mode==='memory'?<Memory/>:game.mode==='builder'?<Builder/>:game.mode==='flow_builder'?<FlowBoard/>:game.mode==='stack_sort'?<StackBoard/>:game.mode==='tower_defense'?<TowerBoard/>:game.mode==='route_rush'?<RouteRushBoard/>:<Choice/>}
   <Text accessibilityLiveRegion="polite" style={[s.message,{color:ui.muted}]}>{message}</Text>
  </View>

  <View style={[s.masteryCard,{backgroundColor:ui.surface,borderColor:ui.line}]}><Text style={[s.masteryKicker,{color:ui.muted}]}>MASTERY</Text><Text style={[s.masteryTitle,{color:ui.ink}]}>{mastery}</Text><Text style={[s.masteryBody,{color:ui.muted}]}>Personal best {bestScore} · {Number(record?.plays||0)} prior run{Number(record?.plays||0)===1?'':'s'}. XP is progression; this is the score you come back to beat.</Text></View>
  <View style={[s.challengeCard,{backgroundColor:ui.surface,borderColor:ui.line}]}><Text style={[s.masteryKicker,{color:ui.muted}]}>CHALLENGE THIS GAME</Text><Text style={[s.challengeTitle,{color:ui.ink}]}>Put your run against someone you follow.</Text><Text style={[s.challengeBody,{color:ui.muted}]}>They get the same game and score ceiling. Fresh scenarios can differ, so the match rewards mastery rather than memorizing one fixed question order.</Text>{challengeMessage?<Text style={[s.challengeNotice,{color:ui.accent}]}>{challengeMessage}</Text>:null}<View style={s.targetList}>{targets.slice(0,6).map(target=><View key={String(target.user_id)} style={[s.targetRow,{borderTopColor:ui.line}]}><Pressable accessibilityRole="button" accessibilityLabel={`View ${target.display_name||target.username||'contributor'} profile`} style={{flex:1}} onPress={()=>router.push({pathname:'/contributor/[id]',params:{id:String(target.user_id)}})}><Text style={[s.targetName,{color:ui.ink}]}>{target.display_name||target.username||'Contributor'}</Text><Text style={[s.targetMeta,{color:ui.muted}]}>{target.relationship||'community'} · view profile →</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Challenge ${target.display_name||target.username||'contributor'}`} style={[s.secondary,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]} onPress={async()=>{try{await createGameChallenge(game.code,String(target.user_id));setChallengeMessage('Challenge sent to '+(target.display_name||target.username||'player')+'.')}catch(error:any){setChallengeMessage(error?.message||'Challenge could not be sent.')}}}><Text style={[s.secondaryText,{color:ui.accent}]}>CHALLENGE</Text></Pressable></View>)}</View>{!targets.length?<Text style={[s.challengeBody,{color:ui.muted}]}>Follow contributors in Community to unlock rivals.</Text>:null}</View>
 </ScrollView></SafeAreaView>;

 function AdvancedAnswers({prefix='CHOOSE'}:{prefix?:string}){
  if(!current)return null;
  return <View style={s.answers}>{current.choices.map((choice,index)=><Pressable accessibilityRole="button" accessibilityLabel={`${prefix} ${choice}`} key={choice+'-'+index} onPress={()=>answer(index)} style={[s.answer,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]}><View style={[s.answerBadge,{backgroundColor:arena.surface}]}><Text style={s.answerBadgeText}>{String.fromCharCode(65+index)}</Text></View><Text style={[s.answerText,{color:ui.ink}]}>{choice}</Text></Pressable>)}</View>;
 }
 function FlowBoard(){
  if(!current)return <Text style={[s.question,{color:ui.ink}]}>No fresh flow node is available.</Text>;
  return <View style={s.advancedBoard}><View style={s.flowRail}>{Array.from({length:game.rounds}).map((_,index)=><View key={index} style={s.flowNodeWrap}><View style={[s.flowNode,{borderColor:arena.accent,backgroundColor:index<round?arena.accent:index===round?arena.surface:ui.surfaceRaised}]}><Text style={[s.flowNodeText,{color:index<=round?'#fff':ui.muted}]}>{index<round?'✓':index+1}</Text></View>{index<game.rounds-1?<View style={[s.flowLink,{backgroundColor:index<round?arena.accent:ui.line}]}/>:null}</View>)}</View><Text style={[s.advancedStatus,{color:ui.accent}]}>FLOW INTEGRITY · {Math.max(0,100-Math.max(0,round-correctCount)*12)}%</Text><Text style={[s.context,{color:ui.muted}]}>{current.stage||'NEXT NODE'}</Text><Text style={[s.question,{color:ui.ink}]}>{current.prompt}</Text>{current.context?<Text style={[s.advancedHint,{color:ui.muted}]}>{current.context}</Text>:null}<AdvancedAnswers prefix="Connect"/>{}</View>;
 }
 function StackBoard(){
  if(!current)return null;
  const height=Math.min(round,7);
  return <View style={s.advancedBoard}><View style={s.stackStage}><Text style={[s.stackLabel,{color:ui.muted}]}>TRUST STACK · {round}/{game.rounds} LAYERS</Text>{Array.from({length:height}).reverse().map((_,index)=><View key={index} style={[s.stackBlock,{width:(68+index*4)+'%' as any,backgroundColor:arena.surface,borderColor:arena.accent}]}><Text style={s.stackBlockText}>STABLE SIGNAL</Text></View>)}<View style={[s.stackTarget,{borderColor:arena.accent,backgroundColor:ui.surfaceRaised}]}><Text style={[s.stackTargetText,{color:ui.accent}]}>PLACE NEXT SIGNAL</Text></View></View><Text style={[s.context,{color:ui.muted}]}>{current.stage}</Text><Text style={[s.question,{color:ui.ink}]}>{current.prompt}</Text><AdvancedAnswers prefix="Stack"/></View>;
 }
 function TowerBoard(){
  if(!current)return null;
  const integrity=Math.round((lives/3)*100);
  return <View style={s.advancedBoard}><View style={[s.towerSky,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]}><View style={s.towerTop}><Text style={s.towerGlyph}>🏰</Text><View style={{flex:1}}><Text style={[s.stackLabel,{color:ui.muted}]}>TOWER INTEGRITY</Text><Text style={[s.towerIntegrity,{color:integrity<=34?ui.danger:ui.accent}]}>{integrity}%</Text></View><Text style={[s.waveCounter,{color:ui.muted}]}>WAVE {Math.min(round+1,game.rounds)}/{game.rounds}</Text></View><View style={[s.integrityTrack,{backgroundColor:ui.line}]}><View style={[s.integrityFill,{width:(String(integrity)+'%') as any,backgroundColor:integrity<=34?ui.danger:arena.accent}]}/></View></View><Text style={[s.context,{color:ui.muted}]}>{current.stage}</Text><Text style={[s.question,{color:ui.ink}]}>{current.prompt}</Text><AdvancedAnswers prefix="Deploy"/></View>;
 }
 function RouteRushBoard(){
  if(!current)return null;
  const metrics=current.routeMetrics||[];
  return <View style={s.advancedBoard}><View style={[s.rushHud,{backgroundColor:arena.surface}]}><View><Text style={s.rushHudLabel}>ROUTE CLOCK</Text><Text style={[s.rushClock,{color:arena.accent}]}>{timeLeft}s</Text></View><View style={{flex:1}}><Text style={s.rushHudLabel}>{current.stage||'NEXT LEG'}</Text><View style={s.rushTrack}>{Array.from({length:game.rounds}).map((_,index)=><View key={index} style={[s.rushDot,{backgroundColor:index<round?arena.accent:index===round?'#fff':'rgba(255,255,255,.22)'}]}/>)}</View></View></View><Text style={[s.question,{color:ui.ink}]}>{current.prompt}</Text><View style={s.routeGrid}>{metrics.map((route,index)=><Pressable key={route.label+'-'+index} accessibilityRole="button" accessibilityLabel={`Choose route ${route.label}`} onPress={()=>answer(index)} style={[s.rushRoute,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]}><View style={[s.routeLetter,{backgroundColor:arena.surface}]}><Text style={s.answerBadgeText}>{route.label}</Text></View><View style={{flex:1}}><Text style={[s.routeMetaStrong,{color:ui.ink}]}>{route.distance} · freshness {route.freshness}</Text><Text style={[s.routeMeta,{color:ui.muted}]}>{route.verified?'✓ verified':'○ unverified'} · {route.accessible?'♿ accessible':'standard access'}{route.neededAmenity?' · ✓ needed amenity':''}</Text></View><Text style={[s.routeGo,{color:ui.accent}]}>GO ›</Text></Pressable>)}</View>{!metrics.length?<AdvancedAnswers prefix="Route"/>:null}</View>;
 }
 function Choice(){
  if(!current)return <Text style={[s.question,{color:ui.ink}]}>No fresh round is available.</Text>;
  return <><Text style={[s.context,{color:ui.muted}]}>{current.stage||current.context||game.instructions}</Text><Text style={[s.question,{color:ui.ink}]}>{current.prompt}</Text>
   {current.routeMetrics?<View style={s.routeGrid}>{current.routeMetrics.map(route=><View key={route.label} style={[s.routeCard,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]}><Text style={[s.routeName,{color:ui.ink}]}>{route.label}</Text><Text style={[s.routeMeta,{color:ui.muted}]}>{route.distance} · freshness {route.freshness}</Text><Text style={[s.routeMeta,{color:ui.muted}]}>{route.verified?'✓ verified':'○ unverified'} · {route.accessible?'♿ accessible':'standard access'}{route.neededAmenity?' · ✓ needed amenity':''}</Text></View>)}</View>:null}
   <View style={s.answers}>{current.choices.map((choice,index)=>{const cost=current.costs?.[index];return <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${choice}`} key={choice} onPress={()=>answer(index)} style={[s.answer,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]}><View style={[s.answerBadge,{backgroundColor:arena.surface}]}><Text style={s.answerBadgeText}>{game.mode==='ranking'?index+1:String.fromCharCode(65+index)}</Text></View><Text style={[s.answerText,{color:ui.ink}]}>{choice}</Text>{cost?<Text style={[s.cost,{color:ui.warning}]}>{cost}◈</Text>:null}</Pressable>})}</View>
  </>;
 }
 function Builder(){
  if(!builder)return null;
  return <><Text style={[s.context,{color:ui.muted}]}>BUILD LAB · SELECT EVERY SUPPORTED AMENITY</Text><Text style={[s.question,{color:ui.ink}]}>{builder.prompt}</Text><View style={s.answers}>{builder.options.map((option:string,index:number)=><Pressable accessibilityRole="checkbox" accessibilityLabel={option} accessibilityState={{checked:builderSelected.includes(index)}} key={option} onPress={()=>toggleBuilder(index)} style={[s.answer,{backgroundColor:ui.surfaceRaised,borderColor:ui.line},builderSelected.includes(index)&&{backgroundColor:arena.surface,borderColor:arena.surface}]}><Text style={[s.answerText,{color:ui.ink},builderSelected.includes(index)&&{color:'#fff'}]}>{builderSelected.includes(index)?'✓ ':''}{option}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Lock profile" style={[s.primary,{backgroundColor:ui.accent}]} onPress={submitBuilder}><Text style={[s.primaryText,{color:ui.accentText}]}>LOCK PROFILE</Text></Pressable></>;
 }
 function Memory(){
  return <><Text style={[s.context,{color:ui.muted}]}>MEMORY GRID · {memoryMoves} MOVES</Text><Text style={[s.question,{color:ui.ink}]}>Match each restroom condition to the evidence that proves it.</Text><View style={s.memoryGrid}>{memoryCards.map((card,index)=>{const shown=memoryOpen.includes(index)||memoryMatched.includes(index);return <Pressable accessibilityRole="button" accessibilityLabel={shown?`Memory card ${card.text}`:'Hidden memory card'} key={index} onPress={()=>flipMemory(index)} style={[s.memoryCard,{backgroundColor:ui.surfaceRaised,borderColor:ui.line},memoryMatched.includes(index)&&{backgroundColor:arena.surface,borderColor:arena.surface}]}><Text style={[s.memoryText,{color:ui.ink},memoryMatched.includes(index)&&{color:'#fff'}]}>{shown?card.text:'?'}</Text></Pressable>})}</View></>;
 }
 function Results(){
  return <View style={s.results}><Text style={[s.resultsKicker,{color:ui.muted}]}>{lives<=0?'RUN ENDED':'RUN COMPLETE'}</Text><Text style={[s.resultsScore,{color:ui.ink}]}>{score}</Text><Text style={[s.resultsLabel,{color:ui.muted}]}>FINAL SCORE</Text><View style={s.resultStats}><Result value={accuracy+'%'} label="accuracy"/><Result value={maxCombo+'×'} label="best combo"/><Result value={mastery} label="mastery"/></View><Pressable accessibilityRole="button" accessibilityLabel="Save run" accessibilityState={{disabled:saved}} disabled={saved} style={[s.primary,{backgroundColor:ui.accent},saved&&s.disabled]} onPress={save}><Text style={[s.primaryText,{color:ui.accentText}]}>{saved?'RUN SAVED':'SAVE RUN'}</Text></Pressable><View style={s.resultActions}><Pressable accessibilityRole="button" accessibilityLabel="Play again" style={[s.secondary,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]} onPress={reset}><Text style={[s.secondaryText,{color:ui.accent}]}>PLAY AGAIN</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Back to Arcade" style={[s.secondary,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]} onPress={()=>router.push('/games')}><Text style={[s.secondaryText,{color:ui.accent}]}>ARCADE</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open League" style={[s.secondary,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]} onPress={()=>router.push('/progress')}><Text style={[s.secondaryText,{color:ui.accent}]}>LEAGUE</Text></Pressable></View></View>;
 }
}
function Hud({value,label}:{value:any;label:string}){return <View style={s.hudCell}><Text style={s.hudValue}>{value}</Text><Text style={s.hudLabel}>{label}</Text></View>}
function Result({value,label}:{value:any;label:string}){const ui=useConsumerTheme('game');return <View style={[s.resultStat,{backgroundColor:ui.surfaceRaised,borderColor:ui.line}]}><Text style={[s.resultValue,{color:ui.ink}]}>{value}</Text><Text style={[s.resultLabel,{color:ui.muted}]}>{label}</Text></View>}

const s=StyleSheet.create({
 safe:{flex:1},content:{padding:18,paddingBottom:50,gap:12},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:12},loadingGlyph:{fontSize:50},loadingText:{fontWeight:'900',color:'#173d2b'},
 hero:{borderRadius:26,padding:20,gap:7},topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},back:{paddingVertical:6,paddingRight:10},backText:{color:'#dce9e1',fontSize:9,fontWeight:'900'},arenaLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.7},glyph:{fontSize:38,marginTop:5},title:{fontSize:34,fontWeight:'900',color:'#fff'},tagline:{fontSize:13,lineHeight:19,color:'#dce9e1'},hud:{flexDirection:'row',gap:6,marginTop:9},hudCell:{flex:1,backgroundColor:'rgba(255,255,255,.09)',borderRadius:12,padding:9},hudValue:{fontSize:17,fontWeight:'900',color:'#fff'},hudLabel:{fontSize:7,fontWeight:'900',color:'#bcd5c5',marginTop:2},roundTrack:{height:7,borderRadius:999,backgroundColor:'rgba(255,255,255,.14)',overflow:'hidden',marginTop:5},roundFill:{height:'100%'},heatRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},heat:{fontSize:9,fontWeight:'900',letterSpacing:1.2},heroMeta:{fontSize:9,fontWeight:'800',color:'#dce9e1'},clock:{fontSize:18,fontWeight:'900'},
 resourceCard:{backgroundColor:'#fff',borderWidth:2,borderRadius:18,padding:14,flexDirection:'row',alignItems:'baseline',gap:8},resourceLabel:{fontSize:9,fontWeight:'900',color:'#65756b'},resourceValue:{fontSize:26,fontWeight:'900',color:'#173d2b'},resourceBody:{fontSize:10,color:'#65756b',flex:1},
 arenaCard:{backgroundColor:'#fff',borderRadius:24,padding:18,gap:12,borderWidth:1,borderColor:'#dbe5de'},challengeHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},challengeKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#65756b'},combo:{fontSize:9,fontWeight:'900',color:'#8b6a1f'},context:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:'#6b7b72'},question:{fontSize:23,lineHeight:28,fontWeight:'900',color:'#13251b'},answers:{gap:9},answer:{minHeight:58,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1.5,borderRadius:15,padding:11,backgroundColor:'#fbfcfb'},answerBadge:{width:31,height:31,borderRadius:16,alignItems:'center',justifyContent:'center'},answerBadgeText:{color:'#fff',fontWeight:'900'},answerText:{flex:1,fontSize:13,lineHeight:18,fontWeight:'800',color:'#173d2b'},cost:{fontSize:10,fontWeight:'900',color:'#8b6a1f'},message:{fontSize:12,lineHeight:18,fontWeight:'800',color:'#52665a'},
 primary:{minHeight:48,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:14},primaryText:{color:'#fff',fontWeight:'900'},secondary:{minHeight:44,borderRadius:12,backgroundColor:'#edf3ef',alignItems:'center',justifyContent:'center',paddingHorizontal:12},secondaryText:{color:'#173d2b',fontWeight:'900',fontSize:10},disabled:{opacity:.5},
 routeGrid:{gap:7},routeCard:{backgroundColor:'#f4f7f5',borderRadius:13,padding:11},routeName:{fontWeight:'900',color:'#173d2b'},routeMeta:{fontSize:10,color:'#64756b',marginTop:2},
 advancedBoard:{gap:12},advancedStatus:{fontSize:10,fontWeight:'900',letterSpacing:1.1},advancedHint:{fontSize:11,lineHeight:16},flowRail:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},flowNodeWrap:{flex:1,flexDirection:'row',alignItems:'center'},flowNode:{width:29,height:29,borderRadius:15,borderWidth:2,alignItems:'center',justifyContent:'center'},flowNodeText:{fontSize:9,fontWeight:'900'},flowLink:{height:3,flex:1,marginHorizontal:3,borderRadius:99},stackStage:{alignItems:'center',gap:5,paddingVertical:4},stackLabel:{fontSize:9,fontWeight:'900',letterSpacing:1},stackBlock:{minHeight:29,borderWidth:1,borderRadius:7,alignItems:'center',justifyContent:'center'},stackBlockText:{color:'#fff',fontSize:8,fontWeight:'900',letterSpacing:.8},stackTarget:{width:'76%',minHeight:36,borderWidth:2,borderStyle:'dashed',borderRadius:9,alignItems:'center',justifyContent:'center'},stackTargetText:{fontSize:9,fontWeight:'900'},towerSky:{borderWidth:1,borderRadius:17,padding:13,gap:9},towerTop:{flexDirection:'row',alignItems:'center',gap:10},towerGlyph:{fontSize:42},towerIntegrity:{fontSize:26,fontWeight:'900'},waveCounter:{fontSize:9,fontWeight:'900'},integrityTrack:{height:10,borderRadius:99,overflow:'hidden'},integrityFill:{height:'100%'},rushHud:{borderRadius:17,padding:13,flexDirection:'row',alignItems:'center',gap:16},rushHudLabel:{color:'#dce9e1',fontSize:8,fontWeight:'900',letterSpacing:1},rushClock:{fontSize:29,fontWeight:'900'},rushTrack:{flexDirection:'row',gap:5,marginTop:8},rushDot:{height:8,flex:1,borderRadius:99},rushRoute:{minHeight:72,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1.5,borderRadius:15,padding:11},routeLetter:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},routeMetaStrong:{fontSize:13,fontWeight:'900'},routeGo:{fontSize:12,fontWeight:'900'},
 memoryGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},memoryCard:{width:'31%',height:84,borderRadius:13,borderWidth:1.5,alignItems:'center',justifyContent:'center',padding:7,backgroundColor:'#fbfcfb'},memoryText:{fontSize:10,textAlign:'center',fontWeight:'900',color:'#173d2b'},
 challengeCard:{backgroundColor:'#fff',borderRadius:18,padding:15,borderWidth:1,borderColor:'#dbe5de',gap:7},challengeTitle:{fontSize:18,fontWeight:'900',color:'#13251b'},challengeBody:{fontSize:11,lineHeight:17,color:'#65756b'},challengeNotice:{fontSize:11,fontWeight:'800',color:'#173d2b'},targetList:{gap:7},targetRow:{flexDirection:'row',gap:8,alignItems:'center',borderTopWidth:1,borderTopColor:'#edf1ee',paddingTop:8},targetName:{fontSize:13,fontWeight:'900',color:'#13251b'},targetMeta:{fontSize:9,color:'#65756b',marginTop:2},masteryCard:{backgroundColor:'#fff',borderRadius:18,padding:15,borderWidth:1,borderColor:'#dbe5de'},masteryKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#65756b'},masteryTitle:{fontSize:22,fontWeight:'900',color:'#173d2b',marginTop:3},masteryBody:{fontSize:11,lineHeight:17,color:'#65756b',marginTop:3},
 results:{alignItems:'center',gap:9},resultsKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.5,color:'#65756b'},resultsScore:{fontSize:58,fontWeight:'900',color:'#13251b'},resultsLabel:{fontSize:9,fontWeight:'900',color:'#65756b'},resultStats:{flexDirection:'row',gap:8,width:'100%'},resultStat:{flex:1,backgroundColor:'#f4f7f5',borderRadius:13,padding:10,alignItems:'center'},resultValue:{fontSize:17,fontWeight:'900',color:'#173d2b'},resultLabel:{fontSize:8,color:'#65756b',fontWeight:'800'},resultActions:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center',marginTop:2}
});
