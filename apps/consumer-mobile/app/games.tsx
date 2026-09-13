import { getKleenestSupabaseClient,getMobileProgressionDashboard } from '@kleenest/mobile-core';
import { router } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View } from 'react-native';
import { GAME_DEFINITIONS } from '../services/gameModes';
import { divisionForXp,divisionProgress,nextDivisionForXp } from '../services/engagementMetaGame';
import { listGameChallenges,respondGameChallenge } from '../services/games';

const ARENA_LABEL:Record<string,string>={
 clean_sweep:'CLEAN SWEEP',bathroom_memory:'MEMORY GRID',trust_or_bust:'TRUST TRIAL',flush_the_facts:'SPEED RUN',
 restroom_relay:'RELAY RUN',stall_strategy:'EVIDENCE BUDGET',sink_sprint:'SPEED RUN',route_to_relief:'ROUTE BOARD',
 review_rater:'RANKING ROOM',evidence_detective:'CASE FILE',amenity_architect:'BUILD LAB',cleanliness_clash:'TRUST BATTLE',
};
const MODE_PROMISE:Record<string,string>={
 evidence_tap:'Protect a 3-strike run and build a sweep combo.',
 memory:'Beat your move count by matching conditions to proof.',
 trust_quiz:'Read the evidence, spot the strongest signal, build accuracy.',
 rapid_fire:'Race the clock. Speed and streaks raise the score.',
 relay:'Keep the evidence chain alive from arrival to refresh.',
 strategy:'Spend a limited evidence budget. Waste nothing.',
 amenity_sprint:'Classify handwashing stations before time runs out.',
 route_puzzle:'Trade distance for freshness, access and confidence.',
 ranking:'Promote the most useful review, not the loudest one.',
 detective:'Solve trust failures before you burn through your lives.',
 builder:'Build only the profile the visit actually proves.',
 multiplayer_trust:'Win evidence-set battles and protect your streak.',
};

export default function GamesHub(){
 const[dashboard,setDashboard]=useState<any>({}),[challenges,setChallenges]=useState<any[]>([]),[userId,setUserId]=useState(''),[message,setMessage]=useState('');
 async function load(){
  try{
   const[d,cg,{data:{user}}]=await Promise.all([getMobileProgressionDashboard(),listGameChallenges(null,30),getKleenestSupabaseClient().auth.getUser()]);
   setDashboard(d);setChallenges(cg);setUserId(user?.id||'');
  }catch(error:any){setMessage(error?.message||'Arcade data could not be loaded.')}
 }
 useEffect(()=>{void load()},[]);
 async function respond(id:string,accept:boolean){try{await respondGameChallenge(id,accept);setMessage(accept?'Challenge accepted.':'Challenge declined.');await load()}catch(error:any){setMessage(error?.message||'Challenge could not be updated.')}}
 const xp=Number(dashboard?.points||0),division=divisionForXp(xp),next=nextDivisionForXp(xp),pct=divisionProgress(xp);
 const groups=useMemo(()=>[
  {title:'FAST + REPLAYABLE',items:GAME_DEFINITIONS.filter(g=>['rapid_fire','amenity_sprint','evidence_tap'].includes(g.mode))},
  {title:'THINK + SOLVE',items:GAME_DEFINITIONS.filter(g=>['trust_quiz','strategy','route_puzzle','ranking','detective','builder'].includes(g.mode))},
  {title:'MATCH + COMPETE',items:GAME_DEFINITIONS.filter(g=>['memory','relay','multiplayer_trust'].includes(g.mode))},
 ],[]);
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
   <View style={s.hero}>
    <Text style={s.eyebrow}>KLEENEST ARCADE</Text>
    <Text style={s.title}>Play for mastery, not just XP.</Text>
    <Text style={s.body}>Every game has its own arena, rules, difficulty curve and personal-best loop. Useful restroom knowledge is the theme; beating yourself and other players is the reason to come back.</Text>
    <View style={s.leagueRow}><View style={s.divisionIcon}><Text style={s.divisionGlyph}>{division.icon}</Text></View><View style={{flex:1}}><Text style={s.divisionName}>{division.name} Division</Text><Text style={s.meta}>{next?String(Math.max(0,next.minXp-xp))+' XP to '+next.name:'Top current division'}</Text><View style={s.track}><View style={[s.fill,{width:(String(Math.round(pct*100))+'%') as any}]} /></View></View><Pressable style={s.progressButton} onPress={()=>router.push('/progress')}><Text style={s.progressButtonText}>League →</Text></Pressable></View>
   </View>

   {groups.map(group=><View key={group.title} style={s.section}>
    <Text style={s.sectionLabel}>{group.title}</Text>
    <View style={s.grid}>{group.items.map(game=><Pressable accessibilityRole="button" accessibilityLabel={'Play '+game.name} key={game.code} style={s.card} onPress={()=>router.push({pathname:'/game/[code]',params:{code:game.code}})}>
      <View style={s.cardTop}><Text style={s.icon}>{game.accent}</Text><View style={s.difficulty}><Text style={s.difficultyText}>{game.difficulty.toUpperCase()}</Text></View></View>
      <Text style={s.arena}>{ARENA_LABEL[game.code]||'GAME ARENA'}</Text>
      <Text style={s.gameName}>{game.name}</Text>
      <Text style={s.cardBody}>{MODE_PROMISE[game.mode]||game.description}</Text>
      <View style={s.cardFoot}><Text style={s.rounds}>{game.rounds} {game.mode==='memory'?'pairs':'rounds'}</Text><Text style={s.play}>PLAY →</Text></View>
    </Pressable>)}</View>
   </View>)}

   <View style={s.section}>
    <Text style={s.sectionLabel}>COMMUNITY MATCHES</Text>
    {message?<Text style={s.notice}>{message}</Text>:null}
    {challenges.length?challenges.slice(0,10).map(row=>{const game=GAME_DEFINITIONS.find(g=>g.code===row.game_code);const mineCreator=String(row.creator_id)===userId;const opponent=mineCreator?row.invitee_name:row.creator_name;const myScore=mineCreator?row.creator_score:row.invitee_score;const playable=row.status==='accepted'&&myScore==null;return <View key={String(row.id)} style={s.match}><View style={{flex:1}}><Text style={s.matchTitle}>{game?.accent||'🎮'} {game?.name||row.game_code}</Text><Text style={s.matchMeta}>{opponent||'Opponent'} · {String(row.status).toUpperCase()} · {row.creator_score??'—'}–{row.invitee_score??'—'}</Text></View>{row.status==='pending'&&!mineCreator?<><Pressable style={s.matchAccept} onPress={()=>respond(String(row.id),true)}><Text style={s.matchAcceptText}>ACCEPT</Text></Pressable><Pressable style={s.matchDecline} onPress={()=>respond(String(row.id),false)}><Text style={s.matchDeclineText}>DECLINE</Text></Pressable></>:null}{playable?<Pressable style={s.matchAccept} onPress={()=>router.push({pathname:'/game/[code]',params:{code:String(row.game_code),challengeId:String(row.id)}})}><Text style={s.matchAcceptText}>PLAY</Text></Pressable>:null}</View>}):<View style={s.empty}><Text style={s.emptyText}>No active matches. Open any game and challenge someone from your community.</Text></View>}
   </View>

   <View style={s.metaGame}>
    <Text style={s.sectionLabelLight}>THE BIGGER GAME</Text>
    <Text style={s.metaTitle}>Games feed your Kleenest identity.</Text>
    <Text style={s.metaBody}>Personal bests, mastery, badges, streaks, useful real-world contributions and community standing all become part of the same long-term climb. XP moves the bar; mastery and reputation make the climb worth defending.</Text>
    <View style={s.metaActions}><Pressable style={s.lightButton} onPress={()=>router.push('/progress')}><Text style={s.lightButtonText}>Progress + badges</Text></Pressable><Pressable style={s.lightButton} onPress={()=>router.push('/social')}><Text style={s.lightButtonText}>Community + rivals</Text></Pressable></View>
   </View>
 </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#f3f6f4'},content:{padding:20,paddingBottom:48,gap:20},hero:{backgroundColor:'#102f21',padding:22,borderRadius:26,gap:8},
 eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.8,color:'#bcd5c5'},title:{fontSize:34,lineHeight:38,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#dce9e1'},
 leagueRow:{marginTop:10,flexDirection:'row',gap:10,alignItems:'center',backgroundColor:'#173f2d',padding:12,borderRadius:18},divisionIcon:{width:44,height:44,borderRadius:22,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},divisionGlyph:{fontSize:23,fontWeight:'900',color:'#173d2b'},divisionName:{fontWeight:'900',color:'#fff'},meta:{fontSize:10,fontWeight:'700',color:'#bcd5c5',marginTop:2},track:{height:6,borderRadius:999,backgroundColor:'rgba(255,255,255,.16)',overflow:'hidden',marginTop:7},fill:{height:'100%',backgroundColor:'#f0d17d'},progressButton:{backgroundColor:'#fff',paddingHorizontal:10,paddingVertical:9,borderRadius:12},progressButtonText:{color:'#173d2b',fontWeight:'900',fontSize:10},
 section:{gap:10},sectionLabel:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:'#5f7166'},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{width:'48%',minHeight:245,backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe5de',borderRadius:20,padding:14,gap:7},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},icon:{fontSize:30},difficulty:{backgroundColor:'#edf3ef',borderRadius:999,paddingHorizontal:7,paddingVertical:5},difficultyText:{fontSize:7,fontWeight:'900',color:'#41614f'},arena:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:'#8b6a1f'},gameName:{fontSize:19,lineHeight:22,fontWeight:'900',color:'#13251b'},cardBody:{fontSize:11,lineHeight:16,color:'#65756b',flex:1},cardFoot:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},rounds:{fontSize:9,fontWeight:'800',color:'#65756b'},play:{fontSize:10,fontWeight:'900',color:'#173d2b'},
 notice:{fontSize:11,fontWeight:'800',color:'#617066'},match:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe5de',borderRadius:16,padding:12,flexDirection:'row',alignItems:'center',gap:7},matchTitle:{fontWeight:'900',color:'#13251b'},matchMeta:{fontSize:10,color:'#65756b',marginTop:3},matchAccept:{backgroundColor:'#173d2b',borderRadius:10,paddingHorizontal:10,paddingVertical:9},matchAcceptText:{fontSize:8,fontWeight:'900',color:'#fff'},matchDecline:{backgroundColor:'#edf3ef',borderRadius:10,paddingHorizontal:10,paddingVertical:9},matchDeclineText:{fontSize:8,fontWeight:'900',color:'#173d2b'},empty:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe5de',borderRadius:16,padding:13},emptyText:{fontSize:11,lineHeight:17,color:'#65756b'},metaGame:{backgroundColor:'#173d2b',borderRadius:24,padding:20,gap:8},sectionLabelLight:{fontSize:9,fontWeight:'900',letterSpacing:1.5,color:'#bcd5c5'},metaTitle:{fontSize:25,fontWeight:'900',color:'#fff'},metaBody:{fontSize:13,lineHeight:20,color:'#dce9e1'},metaActions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:5},lightButton:{backgroundColor:'#fff',borderRadius:12,paddingHorizontal:12,paddingVertical:10},lightButtonText:{fontWeight:'900',color:'#173d2b',fontSize:11}
});