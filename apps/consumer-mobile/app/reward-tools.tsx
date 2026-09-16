import { router } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,SafeAreaView,ScrollView,StyleSheet,Switch,Text,TextInput,View } from 'react-native';
import { listActiveObjectivesV2 } from '../services/discoveryProgression';
import {
 addFavoriteToRewardCollection,createRewardCollection,createRewardCommunityChallenge,getRewardCapabilities,getRewardImpactStats,
 joinRewardCommunityChallenge,listRewardCollectionFavorites,listRewardCollections,listRewardCommunityChallenges,listRewardProposals,
 listRewardVerificationQueue,pinProgressionObjective,rerollProgressionObjective,setRewardBetaFeature,submitRewardDisputeAdvisory,
 unpinProgressionObjective,voteRewardProposal
} from '../services/rewardRuntime';
import { useConsumerTheme } from '../services/theme';

function idOf(row:any){return String(row?.location_id||row?.id||'')}
function Section({kicker,title,body,children}:{kicker:string;title:string;body?:string;children?:any}){
 const theme=useConsumerTheme('progress');
 return <View style={[s.section,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.kicker,{color:theme.accent}]}>{kicker}</Text><Text style={[s.title,{color:theme.ink}]}>{title}</Text>{body?<Text style={[s.body,{color:theme.muted}]}>{body}</Text>:null}{children}</View>;
}
function Pill({label,onPress,active=false,disabled=false}:{label:string;onPress:()=>void;active?:boolean;disabled?:boolean}){
 const theme=useConsumerTheme('progress');
 return <Pressable accessibilityRole="button" accessibilityState={{disabled,selected:active}} disabled={disabled} onPress={onPress} style={[s.pill,{backgroundColor:active?theme.accent:theme.surfaceRaised,borderColor:active?theme.accent:theme.line},disabled&&s.disabled]}><Text style={[s.pillText,{color:active?theme.accentText:theme.ink}]}>{label}</Text></Pressable>;
}

export default function RewardToolsScreen(){
 const theme=useConsumerTheme('progress');
 const[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const[cap,setCap]=useState<any>({}),[objectives,setObjectives]=useState<any[]>([]),[collections,setCollections]=useState<any[]>([]),[favorites,setFavorites]=useState<any[]>([]);
 const[challenges,setChallenges]=useState<any[]>([]),[proposals,setProposals]=useState<any[]>([]),[stats,setStats]=useState<any>(null),[queue,setQueue]=useState<any[]>([]);
 const[collectionName,setCollectionName]=useState(''),[selectedCollection,setSelectedCollection]=useState(''),[challengeTitle,setChallengeTitle]=useState(''),[challengeBody,setChallengeBody]=useState('');
 async function load(){
  setLoading(true);setMessage('');
  try{
   const[nextCap,nextObj,nextCollections,nextFavorites,nextChallenges,nextProposals]=await Promise.all([
    getRewardCapabilities(),listActiveObjectivesV2().catch(()=>[]),listRewardCollections().catch(()=>[]),listRewardCollectionFavorites().catch(()=>[]),
    listRewardCommunityChallenges().catch(()=>[]),listRewardProposals().catch(()=>[])
   ]);
   setCap(nextCap||{});setObjectives(Array.isArray(nextObj)?nextObj:[]);setCollections(nextCollections);setFavorites(nextFavorites);setChallenges(nextChallenges);setProposals(nextProposals);
   setSelectedCollection(current=>current&&nextCollections.some((x:any)=>String(x.id)===current)?current:String(nextCollections[0]?.id||''));
   const[nextStats,nextQueue]=await Promise.all([
    nextCap?.stats_pack?getRewardImpactStats().catch(()=>null):Promise.resolve(null),
    nextCap?.verification_privilege?listRewardVerificationQueue().catch(()=>[]):Promise.resolve([])
   ]);
   setStats(nextStats);setQueue(nextQueue);
  }catch(error:any){setMessage(error?.message||'Reward tools could not be loaded.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[]);
 const modernObjectives=useMemo(()=>objectives.filter((o:any)=>o?.source==='progression_v2').slice(0,12),[objectives]);
 const selected=collections.find((c:any)=>String(c.id)===selectedCollection)||null;
 const equipped=cap?.equipped||{};
 const unlockedMapFilters=Array.isArray(cap?.unlocked_map_filters)?cap.unlocked_map_filters:[];
 const unlockedMapFilterNames=unlockedMapFilters.map((reward:any)=>String(reward?.name||reward?.reward_key||'')).filter(Boolean).join(' · ');
 async function act(work:()=>Promise<any>,success:string){try{setMessage('');await work();setMessage(success);await load()}catch(error:any){setMessage(error?.message||'That reward action could not be completed.')}}
 const focusSlots=1+Number(cap?.quest_slots||0);
 const collectionLimit=3+Number(cap?.saved_collection_bonus||0);
 return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} contentContainerStyle={s.content}>
  <View style={[s.hero,{backgroundColor:theme.surfaceRaised,borderColor:theme.accent}]}><Text style={[s.kicker,{color:theme.accent}]}>PROGRESSION REWARD TOOLKIT</Text><Text style={[s.heroTitle,{color:theme.ink}]}>Unlocked rewards that actually do things.</Text><Text style={[s.body,{color:theme.muted}]}>Cosmetics equip in your Reward Locker. This page is for progression privileges and utilities. Every action is checked again by the server before it runs.</Text><Pressable onPress={()=>router.push('/progress')}><Text style={[s.link,{color:theme.accent}]}>← Back to Progress</Text></Pressable></View>
  {message?<Text accessibilityLiveRegion="polite" style={[s.notice,{color:theme.accent,backgroundColor:theme.accentSoft}]}>{message}</Text>:null}

  <Section kicker="FOCUS BOARD" title={'Pin '+focusSlots+' active objective'+(focusSlots===1?'':'s')} body={cap?.mission_rerolls?'Your bonus quest slot is live, and one daily reroll can hide a V2 objective for 24 hours.':'Pin one V2 objective. Mission Reroll unlocks a 24-hour reroll when earned.'}>
   <View style={s.stack}>{modernObjectives.map((o:any)=><View key={String(o.id)} style={[s.rowCard,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><View style={{flex:1}}><Text style={[s.rowTitle,{color:theme.ink}]}>{o.title}</Text><Text style={[s.meta,{color:theme.muted}]}>{String(o.kind||'objective').toUpperCase()} · {Number(o.progress||0)}/{Number(o.target||1)}</Text></View><View style={s.actions}><Pill label={o.pinned?'Unpin':'Pin'} active={Boolean(o.pinned)} onPress={()=>void act(()=>o.pinned?unpinProgressionObjective(String(o.id)):pinProgressionObjective(String(o.id)),o.pinned?'Objective unpinned.':'Objective pinned.')}/>{cap?.mission_rerolls?<Pill label="Reroll" onPress={()=>void act(()=>rerollProgressionObjective(String(o.id)),'Objective rerolled for 24 hours.')}/>:null}</View></View>)}</View>
  </Section>

  <Section kicker="STREAK SHIELD" title={cap?.streak_shields?'Protection armed':'Protection locked'} body={cap?.streak_shields?'A single missed verification day can be bridged automatically. Last shield use: '+(cap?.streak_shield_last_used||'not used yet')+'. The shield refreshes after 30 days.':'Earn Streak Shield to protect one missed verification day without manually spending a token.'}/>

  <Section kicker="SAVED COLLECTIONS" title={'Curate up to '+collectionLimit+' lists'} body="Collections use locations you already saved. The progression reward expands the baseline from 3 to 8 named collections.">
   <View style={s.inputRow}><TextInput value={collectionName} onChangeText={setCollectionName} placeholder="New collection name" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/><Pill disabled={!collectionName.trim()} label="Create" onPress={()=>void act(async()=>{await createRewardCollection(collectionName.trim());setCollectionName('')},'Collection created.')}/></View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actions}>{collections.map((c:any)=><Pill key={String(c.id)} label={String(c.name)+' · '+String(Array.isArray(c.items)?c.items.length:0)} active={String(c.id)===selectedCollection} onPress={()=>setSelectedCollection(String(c.id))}/>)}</ScrollView>
   {selected?<View style={s.stack}><Text style={[s.subhead,{color:theme.ink}]}>Add a saved place to {selected.name}</Text>{favorites.slice(0,12).map((fav:any)=>{const id=idOf(fav);const already=Array.isArray(selected.items)&&selected.items.some((x:any)=>String(x.location_id)===id);return <View key={id} style={[s.rowCard,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><View style={{flex:1}}><Text style={[s.rowTitle,{color:theme.ink}]}>{fav.name||fav.location_name||'Saved restroom'}</Text><Text style={[s.meta,{color:theme.muted}]}>{[fav.address,fav.city].filter(Boolean).join(', ')}</Text></View><Pill disabled={already} label={already?'Added':'Add'} onPress={()=>void act(()=>addFavoriteToRewardCollection(String(selected.id),id),'Saved place added to collection.')}/></View>})}</View>:null}
  </Section>

  <Section kicker="COMMUNITY CHALLENGES" title={cap?.community_challenge_creator?'Create a community challenge':'Join community challenges'} body={cap?.community_challenge_creator?'Your creator privilege is live. Challenges are social—creating one does not manufacture trust or XP.':'You can join active community challenges now; creating one unlocks later in progression.'}>
   {cap?.community_challenge_creator?<><TextInput value={challengeTitle} onChangeText={setChallengeTitle} placeholder="Challenge title" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/><TextInput value={challengeBody} onChangeText={setChallengeBody} placeholder="What should the community do?" placeholderTextColor={theme.muted} multiline style={[s.input,s.multiline,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/><Pill disabled={challengeTitle.trim().length<3} label="Create 7-day challenge" onPress={()=>void act(async()=>{await createRewardCommunityChallenge(challengeTitle.trim(),challengeBody.trim(),7);setChallengeTitle('');setChallengeBody('')},'Community challenge created.')}/></>:null}
   <View style={s.stack}>{challenges.map((ch:any)=><View key={String(ch.id)} style={[s.rowCard,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><View style={{flex:1}}><Text style={[s.rowTitle,{color:theme.ink}]}>{ch.title}</Text><Text style={[s.meta,{color:theme.muted}]}>{ch.creator_name} · {Number(ch.participant_count||0)} joined · ends {new Date(ch.ends_at).toLocaleDateString()}</Text><Text style={[s.bodySmall,{color:theme.muted}]}>{ch.description}</Text></View><Pill disabled={Boolean(ch.joined)} label={ch.joined?'Joined':'Join'} onPress={()=>void act(()=>joinRewardCommunityChallenge(String(ch.id)),'Challenge joined.')}/></View>)}</View>
  </Section>

  <Section kicker="NETWORK VOTE" title={cap?.community_vote?'Your vote is unlocked':'Voting unlocks later'} body="These are product-direction signals for Kleenest. They do not alter trust data or automatically ship a feature.">
   {proposals.map((p:any)=><View key={String(p.code)} style={[s.proposal,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.rowTitle,{color:theme.ink}]}>{p.title}</Text><Text style={[s.bodySmall,{color:theme.muted}]}>{p.description}</Text><Text style={[s.meta,{color:theme.muted}]}>{Number(p.support||0)} support · {Number(p.not_yet||0)} not yet · {Number(p.abstain||0)} abstain</Text>{cap?.community_vote?<View style={s.actions}>{(['support','not_yet','abstain'] as const).map(v=><Pill key={v} label={v==='not_yet'?'Not yet':v.charAt(0).toUpperCase()+v.slice(1)} active={p.my_vote===v} onPress={()=>void act(()=>voteRewardProposal(String(p.code),v),'Network vote updated.')}/>)}</View>:null}</View>)}
  </Section>

  <Section kicker="KLEENEST LABS" title={cap?.beta_access?'Experimental access enabled':'Labs access locked'} body="Labs features are opt-in and can be turned off again. Evidence Gap Radar adds a real experimental Explore filter for weak or stale evidence.">
   <View style={s.switchRow}><View style={{flex:1}}><Text style={[s.rowTitle,{color:theme.ink}]}>Evidence Gap Radar</Text><Text style={[s.meta,{color:theme.muted}]}>Expose locations that need stronger or fresher evidence in Explore.</Text></View><Switch disabled={!cap?.beta_access} value={Boolean(cap?.beta_features?.evidence_gap_radar)} onValueChange={value=>void act(()=>setRewardBetaFeature('evidence_gap_radar',value),value?'Evidence Gap Radar enabled.':'Evidence Gap Radar disabled.')}/></View>
  </Section>

  <Section kicker="IMPACT ANALYTICS" title={cap?.stats_pack?'Your contribution impact':'Advanced stats locked'} body="These counters come from your real progression events and verification history.">
   {stats?<View style={s.metricGrid}>{[
    ['XP',stats.lifetime_xp],['verified evidence',stats.verified_evidence],['locations',stats.locations_touched],['photos',stats.photos_added],
    ['amenity updates',stats.amenity_updates],['helpful',stats.helpful_contributions],['late-night evidence',stats.late_night_evidence],['game plays',stats.game_plays],
    ['streak',stats.verification_streak],['longest streak',stats.longest_verification_streak]
   ].map(([label,value])=><View key={String(label)} style={[s.metric,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.metricValue,{color:theme.ink}]}>{Number(value||0).toLocaleString()}</Text><Text style={[s.meta,{color:theme.muted}]}>{label}</Text></View>)}</View>:<Text style={[s.meta,{color:theme.muted}]}>Earn Contributor Impact Analytics to open this panel.</Text>}
  </Section>

  <Section kicker="DISPUTED DATA" title={cap?.verification_privilege?'Verification mission queue':'Dispute verification locked'} body="Your advisory becomes an additional signal for Owner review. It does not automatically resolve a dispute or overwrite evidence.">
   {cap?.verification_privilege?(queue.length?queue.slice(0,12).map((q:any)=><View key={String(q.id)} style={[s.proposal,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.rowTitle,{color:theme.ink}]}>{q.location_name}</Text><Text style={[s.meta,{color:theme.muted}]}>{[q.address,q.city,q.state].filter(Boolean).join(', ')} · {q.reason}</Text><View style={s.actions}><Pill label="Current evidence" active={q.my_signal==='supports_current_evidence'} onPress={()=>void act(()=>submitRewardDisputeAdvisory(String(q.id),'supports_current_evidence'),'Verification advisory submitted.')}/><Pill label="Business dispute" active={q.my_signal==='supports_business_dispute'} onPress={()=>void act(()=>submitRewardDisputeAdvisory(String(q.id),'supports_business_dispute'),'Verification advisory submitted.')}/><Pill label="Need more" active={q.my_signal==='needs_more_evidence'} onPress={()=>void act(()=>submitRewardDisputeAdvisory(String(q.id),'needs_more_evidence'),'Verification advisory submitted.')}/></View></View>):<Text style={[s.meta,{color:theme.muted}]}>No open photo disputes need an advisory right now.</Text>):<Text style={[s.meta,{color:theme.muted}]}>Reach the verification privilege gate to help with disputed-data missions.</Text>}
  </Section>

  <Section kicker="PERMANENT MAP FILTERS" title="Unlocked filters stay yours" body={unlockedMapFilterNames?unlockedMapFilterNames+'. Every unlocked filter remains available in Explore and can be combined with the others.':'Earn map-filter rewards to permanently add new Explore filters.'}/>
  <Section kicker="EQUIPPED REWARDS" title="Cosmetics are live elsewhere" body={'Map flair: '+(equipped?.map_flair?.name||'none')+' · Check-in animation: '+(equipped?.checkin_animation?.name||'none')+' · Reaction pack: '+(equipped?.reaction_pack?.name||'none')+'. These cosmetic choices still use one active item per slot.'}/>
 </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1},content:{padding:18,paddingBottom:48,gap:12},hero:{borderWidth:1,borderRadius:24,padding:18,gap:7},heroTitle:{fontSize:28,lineHeight:32,fontWeight:'900'},section:{borderWidth:1,borderRadius:20,padding:15,gap:9},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.3},title:{fontSize:21,fontWeight:'900'},body:{fontSize:12,lineHeight:18},bodySmall:{fontSize:11,lineHeight:16},notice:{padding:12,borderRadius:13,fontSize:12,fontWeight:'800'},link:{fontSize:11,fontWeight:'900',marginTop:4},stack:{gap:8},rowCard:{borderWidth:1,borderRadius:14,padding:11,flexDirection:'row',alignItems:'center',gap:9},rowTitle:{fontSize:13,fontWeight:'900'},meta:{fontSize:10,lineHeight:15,fontWeight:'700'},actions:{flexDirection:'row',flexWrap:'wrap',gap:6},pill:{minHeight:36,borderWidth:1,borderRadius:999,paddingHorizontal:10,alignItems:'center',justifyContent:'center'},pillText:{fontSize:9,fontWeight:'900'},disabled:{opacity:.5},inputRow:{flexDirection:'row',gap:8,alignItems:'center'},input:{minHeight:44,borderWidth:1,borderRadius:12,paddingHorizontal:11,flex:1},multiline:{minHeight:80,textAlignVertical:'top',paddingTop:11},subhead:{fontSize:12,fontWeight:'900'},proposal:{borderWidth:1,borderRadius:14,padding:12,gap:7},switchRow:{flexDirection:'row',alignItems:'center',gap:12},metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{width:'47%',borderWidth:1,borderRadius:13,padding:10},metricValue:{fontSize:20,fontWeight:'900'}
});
