import { router } from 'expo-router';
import { useEffect,useState } from 'react';
import { FlatList,Pressable,RefreshControl,SafeAreaView,StyleSheet,Text,View } from 'react-native';
import { TrustStrip } from '../components/ConsumerUI';
import { useConsumerTheme } from '../services/theme';
import { getWeekInReview,type WeekInReviewSummary,type WeekInReviewVisit } from '../services/weekInReview';
import { chooseReviewPhotos,uploadReviewPhotos } from '../services/reviewPhotos';
import { getProgressionWorld } from '../services/discoveryProgression';

function visitState(item:WeekInReviewVisit){
  if(item.reviewId&&item.photoOpen){const remaining=Math.max(1,3-item.reviewPhotoCount);return{label:'REVIEWED · PHOTO OPTIONAL',detail:`Your review is complete. You can still add ${remaining} photo${remaining===1?'':'s'} from this visit, and verified photo evidence can advance progression.`};}
  if(item.reviewId)return{label:'REVIEWED',detail:'Your review and photo evidence are already part of Kleenest for this visit.'};
  if(item.reviewReady)return{label:'VERIFIED · REVIEW READY',detail:'A verified check-in is available and has not been used for a review yet.'};
  if(item.verificationAvailable)return{label:'Presence detected',detail:'Kleenest detected your on-site presence. Verify the visit before the presence window expires to create verified review evidence.'};
  if(item.verified)return{label:'VERIFIED VISIT',detail:'This visit is verified, but there is no unused review opportunity attached to it.'};
  return{label:'Presence detected',detail:'This is visit history, not verified review evidence. The verification window for this stop has ended.'};
}
function when(value:string){const time=new Date(value);return Number.isNaN(time.getTime())?'Recent visit':time.toLocaleString()}

export default function WeekInReviewScreen(){
  const theme=useConsumerTheme();
  const[summary,setSummary]=useState<WeekInReviewSummary|null>(null),[message,setMessage]=useState('Loading your week…'),[loading,setLoading]=useState(false),[photoBusy,setPhotoBusy]=useState('');
  async function load(){if(loading)return;setLoading(true);try{const next=await getWeekInReview(7);setSummary(next);setMessage(next.visits.length?'':'No Kleenest visits in the last 7 days yet.')}catch(error:any){setMessage(error?.message||'Your week could not be loaded.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  async function addPreviousVisitPhotos(item:WeekInReviewVisit){
    if(!item.reviewId||photoBusy)return;
    const remaining=Math.max(0,3-Number(item.reviewPhotoCount||0));
    if(!remaining){setMessage('That visit already has the maximum of 3 review photos.');return}
    setPhotoBusy(item.visitId);
    try{
      const selected=await chooseReviewPhotos(remaining);
      if(!selected.length)return;
      const before=await getProgressionWorld().catch(()=>null);
      const uploaded=await uploadReviewPhotos(item.reviewId,selected);
      const after=await getProgressionWorld().catch(()=>null);
      const xp=Math.max(0,Number(after?.lifetime_xp||0)-Number(before?.lifetime_xp||0));
      setMessage(`${uploaded.length} saved photo${uploaded.length===1?'':'s'} added to your previous verified visit at ${item.locationName}${xp?` · +${xp} XP`:''}.`);
      await load();
    }catch(error:any){setMessage(error?.message||'Those previous-visit photos could not be added.')}
    finally{setPhotoBusy('')}
  }
  const rows=summary?.visits||[];
  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><FlatList data={rows} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} keyExtractor={item=>item.visitId} contentContainerStyle={s.list} ListHeaderComponent={<>
    <View style={[s.hero,{backgroundColor:theme.accent}]}><Text style={[s.eyebrow,{color:theme.accentText}]}>YOUR WEEK IN REVIEW</Text><Text style={[s.heroTitle,{color:theme.accentText}]}>Turn recent stops into fresh evidence.</Text><Text style={[s.heroBody,{color:theme.accentText}]}>Presence, verified check-ins and published reviews stay distinct. This recap shows what happened and what you can still contribute.</Text><TrustStrip items={['7-day recap','Photos can be added later','Visit proof stays attached']}/><View style={s.stats}><Stat value={summary?.placeCount||0} label="places" theme={theme}/><Stat value={summary?.reviewReadyCount||0} label="review ready" theme={theme}/><Stat value={summary?.photoOpenCount||0} label="photo ready" theme={theme}/></View></View>
    <View style={[s.boundary,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.boundaryTitle,{color:theme.ink}]}>Add photos after you leave.</Text><Text style={[s.body,{color:theme.muted}]}>If you already reviewed a verified visit, choose saved photos here without going back to the location. If a verified visit still needs its review, open it below, add the photos you already took, finish the two required scores, and publish when you have time.</Text></View>
    {message?<Text accessibilityLiveRegion="polite" style={[s.message,{color:theme.muted}]}>{message}</Text>:null}
  </>} ListEmptyComponent={<View style={[s.empty,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.cardTitle,{color:theme.ink}]}>{loading?'Refreshing your week…':'Nothing to review yet.'}</Text><Text style={[s.body,{color:theme.muted}]}>Explore nearby restrooms and Kleenest will build this recap from your own account-scoped visit history.</Text>{!loading?<Pressable style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>router.push('/explore')}><Text style={[s.primaryText,{color:theme.accentText}]}>Explore bathrooms</Text></Pressable>:null}</View>} renderItem={({item})=>{
    const state=visitState(item);const action=item.photoOpen?'Choose saved photos':item.reviewReady?'Review + add photos':item.verificationAvailable?'Verify & review':'Open restroom';const primary=item.photoOpen||item.reviewReady||item.verificationAvailable;const busyPhoto=photoBusy===item.visitId;
    return <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}><View style={s.cardTop}><View style={{flex:1}}><Text style={[s.state,{color:theme.accent}]}>{state.label}</Text><Text style={[s.cardTitle,{color:theme.ink}]}>{item.locationName}</Text></View>{item.reviewId?<Text style={[s.done,{backgroundColor:theme.accentSoft,color:theme.accent}]}>{item.photoOpen?'+ PHOTO':'✓ REVIEWED'}</Text>:null}</View><Text style={[s.meta,{color:theme.muted}]}>{when(item.visitedAt)}</Text><Text style={[s.body,{color:theme.muted}]}>{state.detail}</Text><Pressable accessibilityRole="button" disabled={busyPhoto} style={[s.action,{borderColor:theme.line,backgroundColor:primary?theme.accent:theme.surfaceRaised},busyPhoto&&{opacity:.55}]} onPress={()=>item.photoOpen&&item.reviewId?void addPreviousVisitPhotos(item):item.reviewReady?router.push({pathname:'/location/[id]',params:{id:item.locationId,review:'1',photoFirst:'1'}}):router.push(`/location/${item.locationId}`)}><Text style={[s.actionText,{color:primary?theme.accentText:theme.accent}]}>{busyPhoto?'Adding photos…':action} →</Text></Pressable>{item.photoOpen&&item.reviewId?<Pressable accessibilityRole="button" style={[s.secondaryAction,{borderColor:theme.line,backgroundColor:theme.surfaceRaised}]} onPress={()=>router.push({pathname:'/location/[id]',params:{id:item.locationId,photos:item.reviewId}})}><Text style={[s.secondaryActionText,{color:theme.accent}]}>Open visit details</Text></Pressable>:null}</View>;
  }}/></SafeAreaView>
}
function Stat({value,label,theme}:{value:number;label:string;theme:any}){return <View style={[s.stat,{backgroundColor:theme.surface}]}><Text style={[s.statValue,{color:theme.ink}]}>{value}</Text><Text style={[s.statLabel,{color:theme.muted}]}>{label}</Text></View>}
const s=StyleSheet.create({safe:{flex:1},list:{padding:20,paddingBottom:44,gap:11},hero:{padding:20,borderRadius:26,gap:8},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.6},heroTitle:{fontSize:30,lineHeight:34,fontWeight:'900'},heroBody:{fontSize:14,lineHeight:21,fontWeight:'700',opacity:.88},stats:{flexDirection:'row',gap:8,marginTop:6},stat:{flex:1,borderRadius:14,padding:10},statValue:{fontSize:20,fontWeight:'900'},statLabel:{fontSize:9,fontWeight:'800',marginTop:2},boundary:{borderWidth:1,borderRadius:18,padding:15,gap:4},boundaryTitle:{fontSize:17,fontWeight:'900'},body:{fontSize:13,lineHeight:20},message:{fontWeight:'700'},card:{borderWidth:1,borderRadius:20,padding:17,gap:7},cardTop:{flexDirection:'row',alignItems:'flex-start',gap:8},state:{fontSize:9,fontWeight:'900',letterSpacing:1},cardTitle:{fontSize:19,fontWeight:'900',marginTop:3},meta:{fontSize:12,fontWeight:'700'},done:{fontSize:9,fontWeight:'900',paddingHorizontal:8,paddingVertical:5,borderRadius:999,overflow:'hidden'},action:{minHeight:48,borderWidth:1,borderRadius:12,paddingHorizontal:13,justifyContent:'center',alignItems:'center',marginTop:3},actionText:{fontWeight:'900'},secondaryAction:{minHeight:38,borderWidth:1,borderRadius:10,paddingHorizontal:12,justifyContent:'center',alignItems:'center'},secondaryActionText:{fontWeight:'900',fontSize:11},empty:{borderWidth:1,borderRadius:20,padding:18,gap:7},primary:{minHeight:48,borderRadius:12,paddingHorizontal:14,justifyContent:'center',alignSelf:'flex-start'},primaryText:{fontWeight:'900'}});
