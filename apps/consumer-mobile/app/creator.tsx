import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,Share,StyleSheet,Text,View } from 'react-native';
import { useEffect,useState } from 'react';
import { useConsumerTheme } from '../services/theme';
import { captureCreatorMissionAttribution,loadCreatorMissionLanding,recordCreatorMissionAttribution,type LiveCreatorMission } from '../services/creatorAttribution';

function scalar(value:string|string[]|undefined){
  return Array.isArray(value)?String(value[0]||''):String(value||'');
}
function trackingUrl(mission:LiveCreatorMission,channel='social'){
  return `https://kleenest.app/creator?m=${encodeURIComponent(mission.trackingSlug)}&channel=${encodeURIComponent(channel)}`;
}

export default function CreatorMissionLanding(){
  const theme=useConsumerTheme();
  const router=useRouter();
  const params=useLocalSearchParams<{m?:string|string[];channel?:string|string[]}>();
  const trackingSlug=scalar(params.m).trim().toLowerCase();
  const channel=scalar(params.channel).trim().toLowerCase()||'social';
  const[mission,setMission]=useState<LiveCreatorMission|null>(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    let active=true;
    setLoading(true);
    loadCreatorMissionLanding(trackingSlug).then(value=>{
      if(!active)return;
      setMission(value);
      if(value)captureCreatorMissionAttribution(value.trackingSlug,'landing_view',channel,{creator_handle:value.creatorHandle,objective_id:value.objectiveId,campaign_code:value.campaignCode});
    }).catch(()=>{if(active)setMission(null)}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[channel,trackingSlug]);

  async function openApp(){
    if(mission)await recordCreatorMissionAttribution(mission.trackingSlug,'open_app',channel,{creator_handle:mission.creatorHandle,objective_id:mission.objectiveId,campaign_code:mission.campaignCode}).catch(()=>{});
    router.replace('/?app=1' as any);
  }

  async function install(){
    if(mission)await recordCreatorMissionAttribution(mission.trackingSlug,'install_intent',channel,{creator_handle:mission.creatorHandle,objective_id:mission.objectiveId,campaign_code:mission.campaignCode}).catch(()=>{});
    router.push('/install' as any);
  }

  async function shareMission(){
    if(!mission)return;
    await recordCreatorMissionAttribution(mission.trackingSlug,'share',channel,{creator_handle:mission.creatorHandle,objective_id:mission.objectiveId,campaign_code:mission.campaignCode}).catch(()=>{});
    await Share.share({title:`${mission.creatorName} × Kleenest`,message:`${mission.title}\n${trackingUrl(mission,'shared')}`}).catch(()=>{});
  }

  if(loading){
    return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><View style={s.center}><ActivityIndicator size="large"/><Text style={[s.body,{color:theme.muted}]}>Loading creator mission…</Text></View></SafeAreaView>;
  }

  if(!mission){
    return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><View style={s.center}><Text style={[s.brand,{color:theme.accent}]}>Kleenest</Text><Text style={[s.title,{color:theme.ink}]}>Creator mission not active.</Text><Text style={[s.body,{color:theme.muted}]}>This link is not live yet, has ended, or is no longer available.</Text><Pressable style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>router.replace('/' as any)}><Text style={[s.primaryText,{color:theme.accentText}]}>OPEN KLEENEST</Text></Pressable></View></SafeAreaView>;
  }

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page}>
    <View style={[s.hero,{backgroundColor:theme.accent,borderColor:theme.accent}]}>
      <Text style={[s.eyebrow,{color:theme.accentText}]}>KLEENEST · CREATOR MISSION</Text>
      <Text style={[s.brand,{color:theme.accentText}]}>Kleenest</Text>
      <Text style={[s.creator,{color:theme.accentText}]}>{mission.creatorName}{mission.creatorHandle?` · ${mission.creatorHandle}`:''}</Text>
      <Text style={[s.title,{color:theme.accentText}]}>{mission.title}</Text>
      <Text style={[s.body,{color:theme.accentText}]}>{mission.summary}</Text>
    </View>

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>THE MISSION</Text>
      {mission.steps.map((step,index)=><View key={`${index}:${step}`} style={s.step}><View style={[s.stepNumber,{backgroundColor:theme.accentSoft}]}><Text style={{color:theme.accent,fontWeight:'900'}}>{index+1}</Text></View><Text style={[s.stepText,{color:theme.ink}]}>{step}</Text></View>)}
    </View>

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>YOUR MOVE</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>{mission.cta}</Text>
      <Text style={[s.body,{color:theme.muted}]}>Use real conditions and real observations. Kleenest trust comes from evidence, not promotional claims.</Text>
      <View style={s.actions}>
        <Pressable style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>void openApp()}><Text style={[s.primaryText,{color:theme.accentText}]}>OPEN KLEENEST</Text></Pressable>
        <Pressable style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void install()}><Text style={[s.secondaryText,{color:theme.accent}]}>INSTALL KLEENEST</Text></Pressable>
        <Pressable style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void shareMission()}><Text style={[s.secondaryText,{color:theme.accent}]}>SHARE THIS MISSION</Text></Pressable>
      </View>
    </View>

    <Text style={[s.footer,{color:theme.muted}]}>Find Clean. Go Confident. · #KleenestSTL</Text>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1},
  page:{padding:18,gap:14,paddingBottom:48},
  center:{flex:1,padding:24,justifyContent:'center',gap:12},
  hero:{borderWidth:1,borderRadius:24,padding:20,gap:8},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,opacity:.8},
  brand:{fontSize:34,fontWeight:'900'},
  creator:{fontSize:12,fontWeight:'800',opacity:.9},
  title:{fontSize:30,lineHeight:34,fontWeight:'900'},
  body:{fontSize:13,lineHeight:20,opacity:.92},
  card:{borderWidth:1,borderRadius:20,padding:16,gap:10},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.1},
  cardTitle:{fontSize:20,lineHeight:25,fontWeight:'900'},
  step:{flexDirection:'row',gap:10,alignItems:'flex-start'},
  stepNumber:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center'},
  stepText:{flex:1,fontSize:12,lineHeight:18,fontWeight:'700'},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},
  primary:{borderRadius:12,paddingHorizontal:14,paddingVertical:11},
  primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.5},
  secondary:{borderWidth:1,borderRadius:12,paddingHorizontal:12,paddingVertical:10},
  secondaryText:{fontSize:9,fontWeight:'900',letterSpacing:.45},
  footer:{fontSize:10,textAlign:'center',fontWeight:'800',paddingTop:4}
});
