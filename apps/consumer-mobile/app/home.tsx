import { router } from 'expo-router';
import { useEffect,useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette } from '../components/ConsumerUI';
import { RelevanceHeroCarousel } from '../components/RelevanceHeroCarousel';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { MarketingHome } from '../components/MarketingSite';
import { hasCurrentPolicyAcceptance } from '../services/safety';
import { useConsumerWebExperience } from '../services/webExperience';
import { useConsumerTheme } from '../services/theme';
import { buildConsumerHomeHeroes,type OrganicHeroItem,type OrganicHeroPolicy } from '../services/heroRelevance';

const action=(route:string)=>()=>router.push(route as any);
const initialHero:OrganicHeroItem={id:'find',kind:'find_bathroom',eyebrow:'FIND THE BEST BATHROOM',title:'What is useful near you right now?',body:'Search nearby or around any address, then compare freshness, Kleenest status, amenities, trust and distance.',cta:'Search the map',route:'/explore',meta:'Organic discovery',score:60};
const initialPolicy:OrganicHeroPolicy={surface_code:'consumer_home',active:true,max_cards:5,allowed_kinds:['find_bathroom'],weights:{find_bathroom:60},swipe_enabled:true,dot_indicators:true,autoplay:false};

type HomeShortcut={route:string;icon:string;title:string;detail:string;featured?:boolean};
const homeShortcuts:HomeShortcut[]=[
  {route:'/saved',icon:'♡',title:'Saved',detail:'Your go-to places'},
  {route:'/route',icon:'↗',title:'Routes',detail:'Plan bathroom stops'},
  {route:'/progress',icon:'★',title:'Progress',detail:'XP, levels + rewards'},
  {route:'/games',icon:'▦',title:'Game Center',detail:'Play + earn',featured:true},
  {route:'/social',icon:'●',title:'Community',detail:'People + updates'},
  {route:'/assistant',icon:'✦',title:'Kleenest AI',detail:'Ask for help'},
];

export default function HomeScreen(){
  const theme=useConsumerTheme();
  const{ready:experienceReady,signedIn,installed,appActive}=useConsumerWebExperience();
  const[policyRequired,setPolicyRequired]=useState(false);
  const[heroItems,setHeroItems]=useState<OrganicHeroItem[]>([]);
  const[heroPolicy,setHeroPolicy]=useState<OrganicHeroPolicy>(initialPolicy);
  const[heroReady,setHeroReady]=useState(false);
  useEffect(()=>{let active=true;if(!signedIn){setPolicyRequired(false);return()=>{active=false}}void hasCurrentPolicyAcceptance().then(accepted=>{if(active)setPolicyRequired(!accepted)}).catch(()=>{if(active)setPolicyRequired(false)});return()=>{active=false}},[signedIn]);
  useEffect(()=>{
    if(!experienceReady){setHeroReady(false);return;}
    let active=true;
    setHeroReady(false);
    void buildConsumerHomeHeroes(signedIn)
      .then(result=>{if(!active)return;setHeroPolicy(result.policy);setHeroItems(result.items.length?result.items:[initialHero]);setHeroReady(true)})
      .catch(()=>{if(!active)return;setHeroPolicy(initialPolicy);setHeroItems([initialHero]);setHeroReady(true)});
    return()=>{active=false};
  },[experienceReady,signedIn]);
  if(!experienceReady)return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}/>;
  if(Platform.OS==='web'&&!appActive)return <MarketingHome/>;
  if(!heroReady)return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}/>;
  const showInstall=Platform.OS==='web'&&!signedIn&&!installed;

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={s.brandRow}>
      <View><Text style={[s.brand,{color:theme.ink}]}>KLEENEST</Text><Text style={[s.brandSub,{color:theme.muted}]}>Find it. Trust it. Go.</Text></View>
      <Pressable style={[s.profileChip,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={action(signedIn?'/profile':'/signup')}><Text style={[s.profileChipText,{color:theme.accent}]}>{signedIn?'PROFILE':'GET STARTED'}</Text></Pressable>
    </View>

    {policyRequired?<Pressable accessibilityRole="button" style={[s.notice,{backgroundColor:theme.surfaceRaised,borderColor:theme.warning}]} onPress={action('/legal')}><View style={{flex:1}}><Text style={[s.noticeKicker,{color:theme.warning}]}>ACTION REQUIRED</Text><Text style={[s.noticeTitle,{color:theme.ink}]}>Review community terms</Text></View><Text style={[s.arrow,{color:theme.warning}]}>›</Text></Pressable>:null}
    {!signedIn?<Pressable accessibilityRole="button" style={[s.notice,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/signup')}><View style={{flex:1}}><Text style={[s.noticeKicker,{color:theme.accent}]}>GUEST MODE</Text><Text style={[s.noticeTitle,{color:theme.ink}]}>Browse now. Sign in when you want sync + rewards.</Text></View><Text style={[s.arrow,{color:theme.accent}]}>›</Text></Pressable>:null}

    <View style={[s.primaryPanel,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.primaryKicker,{color:theme.muted}]}>WHERE DO YOU NEED TO GO?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Find a bathroom" style={[s.findAction,{backgroundColor:theme.accent}]} onPress={action('/explore')}>
        <View style={{flex:1}}><Text style={[s.findTitle,{color:theme.accentText}]}>Find a restroom</Text><Text style={[s.findBody,{color:theme.accentText}]}>Search nearby, compare trust, then go.</Text></View><Text style={[s.findArrow,{color:theme.accentText}]}>→</Text>
      </Pressable>
      <View style={s.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Check in" style={[s.secondaryAction,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={action('/qr')}><Text style={[s.secondaryLabel,{color:theme.accent}]}>✓ CHECK IN</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a missing place" style={[s.secondaryAction,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={action('/discover')}><Text style={[s.secondaryLabel,{color:theme.accent}]}>＋ ADD PLACE</Text></Pressable>
      </View>
    </View>

    <RelevanceHeroCarousel items={heroItems} dotIndicators={heroPolicy.dot_indicators} swipeEnabled={heroPolicy.swipe_enabled} autoplay={heroPolicy.autoplay} onOpen={route=>router.push(route as any)}/>
    <SponsoredSlot surface="home" contextClass="home_after_relevance"/>

    <View>
      <View style={s.shortcutsHeading}>
        <Text style={[s.shortcutsLabel,{color:theme.muted}]}>YOUR KLEENEST</Text>
        <Text style={[s.shortcutsHint,{color:theme.muted}]}>Quick access</Text>
      </View>
      <View style={s.shortcuts}>
        {homeShortcuts.map(item=><Pressable
          key={item.route}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={[s.shortcut,{backgroundColor:item.featured?theme.accentSoft:theme.surface,borderColor:item.featured?theme.accent:theme.line}]}
          onPress={action(item.route)}
        >
          <View style={[s.shortcutIcon,{backgroundColor:item.featured?theme.accent:theme.surfaceRaised,borderColor:item.featured?theme.accent:theme.line}]}>
            <Text style={[s.shortcutIconText,{color:item.featured?theme.accentText:theme.accent}]}>{item.icon}</Text>
          </View>
          <View style={s.shortcutCopy}>
            <Text numberOfLines={1} style={[s.shortcutText,{color:theme.ink}]}>{item.title}</Text>
            <Text numberOfLines={1} style={[s.shortcutDetail,{color:theme.muted}]}>{item.detail}</Text>
          </View>
          <Text style={[s.shortcutArrow,{color:item.featured?theme.accent:theme.muted}]}>›</Text>
        </Pressable>)}
      </View>
    </View>

    {showInstall?<Pressable accessibilityRole="button" accessibilityLabel="Install Kleenest" style={[s.install,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/install')}><Text style={[s.installText,{color:theme.accent}]}>Install Kleenest on this device</Text><Text style={[s.arrow,{color:theme.accent}]}>›</Text></Pressable>:null}

    <Pressable accessibilityRole="button" style={s.profileHint} onPress={action('/profile')}><Text style={[s.profileHintText,{color:theme.muted}]}>Membership, family, messages, notifications, support and account controls live in Profile →</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.canvas},
  content:{padding:20,paddingBottom:36,gap:14},
  brandRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brand:{fontSize:15,fontWeight:'900',letterSpacing:2.8},
  brandSub:{fontSize:11,fontWeight:'800',marginTop:2},
  profileChip:{borderWidth:1,paddingHorizontal:12,paddingVertical:8,borderRadius:999},
  profileChipText:{fontSize:9,fontWeight:'900',letterSpacing:1},
  notice:{borderWidth:1,borderRadius:15,paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:10},
  noticeKicker:{fontSize:8,fontWeight:'900',letterSpacing:1},
  noticeTitle:{fontSize:13,lineHeight:17,fontWeight:'900',marginTop:2},
  arrow:{fontSize:25,fontWeight:'800'},
  primaryPanel:{borderWidth:1,borderRadius:20,padding:14,gap:10},
  primaryKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  findAction:{minHeight:78,borderRadius:16,padding:15,flexDirection:'row',alignItems:'center',gap:12},
  findTitle:{fontSize:21,fontWeight:'900'},
  findBody:{fontSize:11,lineHeight:16,fontWeight:'700',opacity:.82,marginTop:3},
  findArrow:{fontSize:28,fontWeight:'900'},
  actionRow:{flexDirection:'row',gap:8},
  secondaryAction:{flex:1,minHeight:48,borderWidth:1,borderRadius:13,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
  secondaryLabel:{fontSize:10,fontWeight:'900',letterSpacing:.6,textAlign:'center'},
  shortcutsHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8,paddingHorizontal:1},
  shortcutsLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  shortcutsHint:{fontSize:9,fontWeight:'800'},
  shortcuts:{flexDirection:'row',flexWrap:'wrap',gap:10},
  shortcut:{width:'48%',flexGrow:1,minHeight:76,borderWidth:1,borderRadius:16,padding:11,flexDirection:'row',alignItems:'center',gap:9},
  shortcutIcon:{width:34,height:34,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},
  shortcutIconText:{fontSize:17,fontWeight:'900'},
  shortcutCopy:{flex:1,minWidth:0},
  shortcutText:{fontSize:12,fontWeight:'900'},
  shortcutDetail:{fontSize:9,lineHeight:12,fontWeight:'700',marginTop:2},
  shortcutArrow:{fontSize:18,fontWeight:'900',marginLeft:1},
  install:{borderWidth:1,borderRadius:14,paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  installText:{fontSize:12,fontWeight:'900'},
  profileHint:{paddingVertical:8,paddingHorizontal:4},
  profileHintText:{fontSize:10,lineHeight:15,fontWeight:'700',textAlign:'center'},
});