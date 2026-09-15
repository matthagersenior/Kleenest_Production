import { router } from 'expo-router';
import { useEffect,useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FeatureCard, HeroCard, SectionHeader, palette } from '../components/ConsumerUI';
import { MarketingHome } from '../components/MarketingSite';
import { hasCurrentPolicyAcceptance } from '../services/safety';
import { useConsumerWebExperience } from '../services/webExperience';
import { useConsumerTheme } from '../services/theme';

const action=(route:string)=>()=>router.push(route as any);

export default function HomeScreen(){
  const theme=useConsumerTheme();
  const{ready:webGateReady,signedIn,installed,appActive}=useConsumerWebExperience();
  const[policyRequired,setPolicyRequired]=useState(false);
  useEffect(()=>{let active=true;if(!signedIn){setPolicyRequired(false);return()=>{active=false}}void hasCurrentPolicyAcceptance().then(accepted=>{if(active)setPolicyRequired(!accepted)}).catch(()=>{if(active)setPolicyRequired(false)});return()=>{active=false}},[signedIn]);
  if(Platform.OS==='web'&&!webGateReady)return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}/>;
  if(Platform.OS==='web'&&!appActive)return <MarketingHome/>;
  const showInstall=Platform.OS==='web'&&!signedIn&&!installed;
  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={s.brandRow}><View><Text style={[s.brand,{color:theme.ink}]}>KLEENEST</Text><Text style={[s.brandSub,{color:theme.muted}]}>Trusted restroom discovery network</Text></View><Pressable style={[s.profileChip,{backgroundColor:theme.accentSoft}]} onPress={action(signedIn?'/profile':'/signup')}><Text style={[s.profileChipText,{color:theme.accent}]}>{signedIn?'PROFILE':'JOIN'}</Text></Pressable></View>

    {policyRequired?<Pressable accessibilityRole="button" style={[s.policyBanner,{backgroundColor:theme.resolved==='dark'?theme.surfaceRaised:'#fff8e8',borderColor:theme.resolved==='dark'?theme.warning:'#e7cd8e'}]} onPress={action('/legal')}><View style={{flex:1}}><Text style={[s.policyKicker,{color:theme.warning}]}>ACTION REQUIRED</Text><Text style={[s.policyTitle,{color:theme.ink}]}>Review community terms</Text><Text style={[s.policyBody,{color:theme.muted}]}>Accept the current Terms and Community Guidelines before posting reviews, community content or messages.</Text></View><Text style={[s.policyArrow,{color:theme.warning}]}>›</Text></Pressable>:null}
    {!signedIn?<Pressable accessibilityRole="button" style={[s.joinBanner,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/signup')}><View style={{flex:1}}><Text style={[s.joinKicker,{color:theme.accent}]}>INDIVIDUAL OR FAMILY</Text><Text style={[s.joinTitle,{color:theme.ink}]}>Create your Kleenest account</Text><Text style={[s.joinBody,{color:theme.muted}]}>Start as an individual or choose Family from signup. Family benefits remain entitlement-controlled through the approved membership path.</Text></View><Text style={[s.joinArrow,{color:theme.accent}]}>›</Text></Pressable>:null}

    <HeroCard eyebrow="YOUR KLEENEST" title="Find a bathroom you can trust." body="Search near you or around any address. When you are on site, check in with GPS + geofence; use QR when available for stronger proof.">
      <Pressable accessibilityRole="button" accessibilityLabel="Find a bathroom" style={[s.homePrimaryCta,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/explore')}><Text style={[s.homePrimaryLabel,{color:theme.muted}]}>FIND A BATHROOM</Text><Text style={[s.homePrimaryTitle,{color:theme.accent}]}>Search the map →</Text><Text style={[s.homePrimaryBody,{color:theme.muted}]}>Nearby · any address · amenities · trust · directions</Text></Pressable>
      <View style={s.heroQuickRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Check in at a restroom" style={[s.heroQuick,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]} onPress={action('/explore')}><Text style={[s.heroQuickLabel,{color:theme.muted}]}>CHECK IN</Text><Text style={[s.heroQuickTitle,{color:theme.ink}]}>Nearby or search</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Scan a Kleenest QR code" style={[s.heroQuick,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]} onPress={action('/qr')}><Text style={[s.heroQuickLabel,{color:theme.muted}]}>QR PROOF</Text><Text style={[s.heroQuickTitle,{color:theme.ink}]}>Scan code</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a missing place" style={[s.heroQuick,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]} onPress={action('/discover')}><Text style={[s.heroQuickLabel,{color:theme.muted}]}>ADD TO MAP</Text><Text style={[s.heroQuickTitle,{color:theme.ink}]}>Missing place</Text></Pressable>
      </View>
    </HeroCard>

    {showInstall?<Pressable accessibilityRole="button" accessibilityLabel="Install Kleenest" style={[s.installFeature,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/install')}>
      <View style={[s.installFeatureIcon,{backgroundColor:theme.accent}]}><Text style={[s.installFeatureIconText,{color:theme.accentText}]}>⇩</Text></View>
      <View style={{flex:1}}><Text style={[s.installFeatureKicker,{color:theme.accent}]}>GET KLEENEST</Text><Text style={[s.installFeatureTitle,{color:theme.ink}]}>Install on this device</Text><Text style={[s.installFeatureBody,{color:theme.muted}]}>Add the web app to your Home Screen or desktop, check install health, share the installer, or get the verified Android APK.</Text></View>
      <Text style={[s.installFeatureArrow,{color:theme.accent}]}>›</Text>
    </Pressable>:null}

    <SectionHeader eyebrow="QUICK ACTIONS" title="Keep your next move one tap away." body="The hero already handles finding, scanning and adding places. Quick Actions now stays focused on the tools you come back to."/>
    <View style={s.twoCol}>
      <FeatureCard kicker="GAME CENTER" title="Play + challenges" body="Jump into games, active quests, challenges, contests and leaderboard competition tied to Kleenest progression." onPress={action('/games')}/>
      <FeatureCard kicker="SAVED" title="Trusted shortlist" body="Return to bathrooms you trust or want to verify again." onPress={action('/saved')}/>
      <FeatureCard kicker="ROUTE" title="Plan smarter" body="Build a bathroom-first route around the stops that matter." onPress={action('/route')}/>
      <FeatureCard kicker="OFFLINE" title="Take routes with you" body="Prepare canonical route discovery and restroom packs before coverage gets weak." onPress={action('/offline')}/>
      <FeatureCard kicker="ACTIVITY" title="Your impact" body="See visits, discoveries, reviews, evidence, rewards and network contributions." onPress={action('/activity')}/>
      <FeatureCard kicker="WEEKLY" title="Week in review" body="See your last 7 days, finish verified reviews while they are fresh, and keep detected presence separate from verified evidence." onPress={action('/week-in-review')}/>
    </View>

    <SectionHeader eyebrow="THE KLEENEST LOOP" title="One useful action strengthens the whole network." body="This is the core Kleenest cycle: discover what is missing, verify what is real, then turn fresh evidence into stronger trust for everyone."/>
    <View style={[s.loopCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <View style={[s.loopLead,{backgroundColor:theme.accentSoft}]}><Text style={[s.loopLeadKicker,{color:theme.accent}]}>WHY IT MATTERS</Text><Text style={[s.loopLeadTitle,{color:theme.ink}]}>Kleenest gets better through repeated, independent evidence.</Text><Text style={[s.loopLeadBody,{color:theme.muted}]}>A restroom can begin as a candidate and become increasingly useful as people document it, verify conditions and keep its trust signals fresh.</Text></View>
      {[
        {number:'1',kicker:'FIND + DISCOVER',title:'Start with what exists',body:'Search the network first. When a useful place is missing, add it from an address, map point, GPS or on-site evidence.'},
        {number:'2',kicker:'VERIFY + DOCUMENT',title:'Make the place more useful',body:'Check in, confirm the restroom, add photos, amenities and fresh observations that other people can actually rely on.'},
        {number:'3',kicker:'STRENGTHEN + REWARD',title:'Trust compounds',body:'Independent evidence strengthens confidence while eligible contributions advance your Kleenest progression without duplicate rewards.'},
      ].map(stage=><View style={s.loopStage} key={stage.number}><View style={[s.loopNumber,{backgroundColor:theme.accentSoft}]}><Text style={[s.loopNumberText,{color:theme.accent}]}>{stage.number}</Text></View><View style={{flex:1}}><Text style={[s.loopStageKicker,{color:theme.accent}]}>{stage.kicker}</Text><Text style={[s.loopStageTitle,{color:theme.ink}]}>{stage.title}</Text><Text style={[s.loopStageBody,{color:theme.muted}]}>{stage.body}</Text></View></View>)}
    </View>

    <SectionHeader eyebrow="YOUR PROGRESS" title="Every verified action can move you forward." body="XP + levels are only the beginning. Kleenest progression also connects specialties, quests, missions, challenges, journeys, campaigns, contests, badges and rankings."/>
    <View style={[s.actionBand,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><View style={{flex:1}}><Text style={[s.actionBandTitle,{color:theme.ink}]}>See what your contributions are unlocking</Text><Text style={[s.actionBandBody,{color:theme.muted}]}>Remote discovery can earn useful XP. GPS-supported evidence earns more. Fresh on-site evidence carries the strongest discovery weighting, while the server keeps rewards authoritative.</Text><View style={s.progressRow}><View style={[s.progressPill,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.progressPillTitle,{color:theme.accent}]}>LEVELS</Text><Text style={[s.progressPillBody,{color:theme.ink}]}>Specialties + XP</Text></View><View style={[s.progressPill,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.progressPillTitle,{color:theme.accent}]}>OBJECTIVES</Text><Text style={[s.progressPillBody,{color:theme.ink}]}>Quests + missions</Text></View><View style={[s.progressPill,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.progressPillTitle,{color:theme.accent}]}>STANDING</Text><Text style={[s.progressPillBody,{color:theme.ink}]}>Badges + rankings</Text></View></View></View><Pressable style={[s.actionBandButton,{backgroundColor:theme.accent}]} onPress={action('/progress')}><Text style={[s.actionBandButtonText,{color:theme.accentText}]}>VIEW PROGRESS</Text></Pressable></View>

    <SectionHeader eyebrow="KLEENEST AI" title="A copilot grounded in your Kleenest context." body="Use AI to understand the evidence you already have, reason about saved stops, or turn your own observations into a useful draft—without creating a second source of truth."/>
    <View style={[s.aiBand,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}>
      <View><Text style={[s.aiTitle,{color:theme.ink}]}>Ask better questions about the places you already trust.</Text><Text style={[s.aiBody,{color:theme.muted}]}>Kleenest AI stays grounded in the canonical context supplied for your request and clearly separates what is supported from what still needs human verification.</Text></View>
      <View style={s.aiCapabilityRow}>
        <View style={[s.aiCapability,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.aiCapabilityKicker,{color:theme.accent}]}>TRUST GUIDE</Text><Text style={[s.aiCapabilityTitle,{color:theme.ink}]}>Understand evidence</Text><Text style={[s.aiCapabilityBody,{color:theme.muted}]}>Explain what is supported, uncertain and worth verifying before you rely on a restroom.</Text></View>
        <View style={[s.aiCapability,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.aiCapabilityKicker,{color:theme.accent}]}>ROUTE GUIDE</Text><Text style={[s.aiCapabilityTitle,{color:theme.ink}]}>Reason about saved stops</Text><Text style={[s.aiCapabilityBody,{color:theme.muted}]}>Compare your saved restroom context and discuss a sensible ordering strategy without inventing travel times.</Text></View>
        <View style={[s.aiCapability,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.aiCapabilityKicker,{color:theme.accent}]}>REVIEW DRAFT</Text><Text style={[s.aiCapabilityTitle,{color:theme.ink}]}>Turn facts into a draft</Text><Text style={[s.aiCapabilityBody,{color:theme.muted}]}>Draft concise review text from details you personally provide, with a reminder to verify before publishing.</Text></View>
      </View>
      <Pressable style={[s.aiButton,{backgroundColor:theme.accent}]} onPress={action('/assistant')}><Text style={[s.aiButtonText,{color:theme.accentText}]}>OPEN KLEENEST AI</Text></Pressable>
    </View>

    <SectionHeader eyebrow="COMMUNITY" title="People helping people find better bathrooms." body="Community combines the people, evidence and activity that make the map smarter. Follow useful contributors, see verified visit evidence, understand contributor reputation and keep up with what your network is learning."/>
    <View style={[s.communityCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.communityKicker,{color:theme.accent}]}>YOUR NETWORK</Text>
      <Text style={[s.communityTitle,{color:theme.ink}]}>One community, one clear destination.</Text>
      <Text style={[s.communityBody,{color:theme.muted}]}>The Community page brings together Following, Followers, Community Pulse, verified visit evidence and contributor reputation so you do not need several homepage cards saying the same thing.</Text>
      <View style={s.communitySignals}><Text style={[s.communitySignal,{backgroundColor:theme.accentSoft,color:theme.accent}]}>Following + followers</Text><Text style={[s.communitySignal,{backgroundColor:theme.accentSoft,color:theme.accent}]}>Community pulse</Text><Text style={[s.communitySignal,{backgroundColor:theme.accentSoft,color:theme.accent}]}>Verified evidence</Text><Text style={[s.communitySignal,{backgroundColor:theme.accentSoft,color:theme.accent}]}>Contributor reputation</Text></View>
      <Pressable style={[s.communityButton,{backgroundColor:theme.accent}]} onPress={action('/social')}><Text style={[s.communityButtonText,{color:theme.accentText}]}>OPEN COMMUNITY</Text></Pressable>
    </View>

    <SectionHeader eyebrow="MORE" title="Account, access and support stay close."/>
    <View style={s.moreRow}>
      {showInstall?<Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/install')}><Text style={[s.moreTitle,{color:theme.accent}]}>Install Kleenest</Text><Text style={[s.moreBody,{color:theme.muted}]}>Web app + verified Android APK</Text></Pressable>:null}
      <Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/membership')}><Text style={[s.moreTitle,{color:theme.accent}]}>Membership</Text><Text style={[s.moreBody,{color:theme.muted}]}>Premium + Family options</Text></Pressable>
      <Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/family')}><Text style={[s.moreTitle,{color:theme.accent}]}>Family</Text><Text style={[s.moreBody,{color:theme.muted}]}>Create or join your group</Text></Pressable>
      <Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/messages')}><Text style={[s.moreTitle,{color:theme.accent}]}>Messages</Text><Text style={[s.moreBody,{color:theme.muted}]}>Talk with trusted contributors</Text></Pressable>
      <Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/access')}><Text style={[s.moreTitle,{color:theme.accent}]}>Access</Text><Text style={[s.moreBody,{color:theme.muted}]}>Preferred + single-use access</Text></Pressable>
      <Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/notifications')}><Text style={[s.moreTitle,{color:theme.accent}]}>Notifications</Text><Text style={[s.moreBody,{color:theme.muted}]}>Updates + trust opportunities</Text></Pressable>
      <Pressable style={[s.more,{backgroundColor:theme.surface,borderColor:theme.line}]} onPress={action('/support')}><Text style={[s.moreTitle,{color:theme.accent}]}>Support</Text><Text style={[s.moreBody,{color:theme.muted}]}>Help + feedback</Text></Pressable>
    </View>
    <Text style={[s.footer,{color:theme.muted}]}>Kleenest gets better when every useful discovery makes the network smarter.</Text>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.canvas},
  content:{padding:20,paddingBottom:44,gap:15},
  brandRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:2},
  brand:{fontSize:14,fontWeight:'900',letterSpacing:2.8,color:palette.green},
  brandSub:{fontSize:10,fontWeight:'800',color:'#708077',marginTop:2},
  profileChip:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,paddingHorizontal:12,paddingVertical:8,borderRadius:999},
  profileChipText:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  policyBanner:{backgroundColor:'#fff8e8',borderWidth:1,borderColor:'#e7cd8e',borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:10},
  policyKicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#7a5a15'},
  policyTitle:{fontSize:17,fontWeight:'900',color:'#493914',marginTop:2},
  policyBody:{fontSize:12,lineHeight:17,color:'#6c5a2d',marginTop:3},
  policyArrow:{fontSize:28,color:'#7a5a15'},
  joinBanner:{backgroundColor:'#e9f3ed',borderWidth:1,borderColor:'#c9ded0',borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:10},
  joinKicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  joinTitle:{fontSize:17,fontWeight:'900',color:palette.ink,marginTop:2},
  joinBody:{fontSize:12,lineHeight:17,color:palette.muted,marginTop:3},
  joinArrow:{fontSize:28,color:palette.green},
  homePrimaryCta:{backgroundColor:'#fff',padding:15,borderRadius:16,marginTop:5,borderWidth:2,borderColor:'#d7e8dc'},
  homePrimaryLabel:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#557060'},
  homePrimaryTitle:{fontSize:20,fontWeight:'900',color:palette.green,marginTop:2},
  homePrimaryBody:{fontSize:10,lineHeight:15,color:palette.muted,marginTop:3,fontWeight:'700'},
  heroQuickRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
  heroQuick:{flexGrow:1,flexBasis:'31%',minWidth:96,minHeight:58,backgroundColor:'#2b513e',paddingHorizontal:11,paddingVertical:10,borderRadius:13,justifyContent:'center'},
  heroQuickLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:'#bcd4c5'},
  heroQuickTitle:{fontSize:12,fontWeight:'900',color:'#fff',marginTop:2},
  installFeature:{backgroundColor:'#fff',borderWidth:2,borderColor:'#bfd8c7',borderRadius:20,padding:15,flexDirection:'row',alignItems:'center',gap:12},
  installFeatureIcon:{width:42,height:42,borderRadius:14,backgroundColor:palette.green,alignItems:'center',justifyContent:'center'},
  installFeatureIconText:{fontSize:22,fontWeight:'900',color:'#fff'},
  installFeatureKicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  installFeatureTitle:{fontSize:18,fontWeight:'900',color:palette.ink,marginTop:2},
  installFeatureBody:{fontSize:11,lineHeight:16,color:palette.muted,marginTop:3},
  installFeatureArrow:{fontSize:30,color:palette.green,fontWeight:'700'},
  twoCol:{flexDirection:'row',flexWrap:'wrap',gap:10},
  aiBand:{backgroundColor:'#e8f2ec',borderRadius:22,borderWidth:1,borderColor:'#cfe0d5',padding:17,gap:14},
  aiTitle:{fontSize:21,lineHeight:26,fontWeight:'900',color:palette.ink},
  aiBody:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:5},
  aiCapabilityRow:{gap:8},
  aiCapability:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d9e6de',borderRadius:15,padding:12},
  aiCapabilityKicker:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:palette.green},
  aiCapabilityTitle:{fontSize:14,fontWeight:'900',color:palette.ink,marginTop:3},
  aiCapabilityBody:{fontSize:11,lineHeight:16,color:palette.muted,marginTop:3},
  aiButton:{alignSelf:'flex-start',backgroundColor:palette.green,paddingHorizontal:14,paddingVertical:11,borderRadius:12},
  aiButtonText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},
  loopCard:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:22,padding:16,gap:10},
  loopLead:{backgroundColor:'#edf5f0',borderRadius:15,padding:13},
  loopLeadKicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  loopLeadTitle:{fontSize:18,lineHeight:23,fontWeight:'900',color:palette.ink,marginTop:3},
  loopLeadBody:{fontSize:12,lineHeight:18,color:palette.muted,marginTop:4},
  loopStage:{flexDirection:'row',gap:11,alignItems:'flex-start',paddingVertical:6},
  loopNumber:{width:29,height:29,borderRadius:15,backgroundColor:palette.mint,alignItems:'center',justifyContent:'center',marginTop:2},
  loopNumberText:{fontSize:12,fontWeight:'900',color:palette.green},
  loopStageKicker:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:palette.green},
  loopStageTitle:{fontSize:16,fontWeight:'900',color:palette.ink,marginTop:2},
  loopStageBody:{fontSize:12,lineHeight:18,color:palette.muted,marginTop:3},
  actionBand:{backgroundColor:'#eaf3ed',borderRadius:20,borderWidth:1,borderColor:'#cfe0d5',padding:16,gap:12},
  actionBandTitle:{fontSize:19,fontWeight:'900',color:palette.ink},
  actionBandBody:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:4},
  actionBandButton:{alignSelf:'flex-start',backgroundColor:palette.green,paddingHorizontal:14,paddingVertical:11,borderRadius:12},
  actionBandButtonText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},
  progressRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:11},
  progressPill:{flexGrow:1,minWidth:'30%',backgroundColor:'#fff',borderRadius:12,padding:10,borderWidth:1,borderColor:'#d7e4db'},
  progressPillTitle:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:palette.green},
  progressPillBody:{fontSize:10,fontWeight:'800',color:palette.ink,marginTop:2},
  communityCard:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:22,padding:17,gap:9},
  communityKicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  communityTitle:{fontSize:21,lineHeight:26,fontWeight:'900',color:palette.ink},
  communityBody:{fontSize:13,lineHeight:20,color:palette.muted},
  communitySignals:{flexDirection:'row',flexWrap:'wrap',gap:7},
  communitySignal:{fontSize:10,fontWeight:'800',color:palette.green,backgroundColor:'#edf5f0',paddingHorizontal:10,paddingVertical:7,borderRadius:999},
  communityButton:{alignSelf:'flex-start',backgroundColor:palette.green,paddingHorizontal:14,paddingVertical:11,borderRadius:12},
  communityButtonText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},
  moreRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
  more:{minWidth:'47%',flexGrow:1,backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:16,padding:12},
  moreTitle:{fontSize:12,fontWeight:'900',color:palette.green},
  moreBody:{fontSize:10,lineHeight:14,color:palette.muted,marginTop:3},
  footer:{fontSize:11,fontWeight:'700',color:'#7a8980',textAlign:'center',marginTop:9},
});
