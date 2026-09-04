import { router } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FeatureCard, HeroCard, SectionHeader, TrustStrip, palette } from '../components/ConsumerUI';

const action=(route:string)=>()=>router.push(route as any);

export default function HomeScreen(){
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View style={s.brandRow}><View><Text style={s.brand}>KLEENEST</Text><Text style={s.brandSub}>Trusted restroom discovery network</Text></View><Pressable style={s.profileChip} onPress={action('/profile')}><Text style={s.profileChipText}>PROFILE</Text></Pressable></View>

    <HeroCard eyebrow="YOUR KLEENEST" title="Find a better bathroom. Discover what the map is missing." body="Explore nearby restrooms, add missing places, document real-world evidence, and turn useful contributions into XP, levels, badges and standing.">
      <TrustStrip items={['Community discovery','Evidence-weighted XP','Fresh restroom intelligence']}/>
      <View style={s.heroActions}><Pressable style={s.heroPrimary} onPress={action('/explore')}><Text style={s.heroPrimaryLabel}>FIND A RESTROOM</Text><Text style={s.heroPrimaryTitle}>Explore nearby →</Text></Pressable><Pressable style={s.heroSecondary} onPress={action('/discover')}><Text style={s.heroSecondaryLabel}>MAP THE MISSING</Text><Text style={s.heroSecondaryTitle}>Discover a place</Text></Pressable></View>
    </HeroCard>

    <SectionHeader eyebrow="QUICK ACTIONS" title="Find it, discover it, improve it." body="Kleenest grows when the community can add what nearby search missed—not only review places after arriving."/>
    <View style={s.twoCol}>
      <FeatureCard kicker="NEARBY" title="Find a restroom" body="Map, search, amenities, trust, distance, details and directions." onPress={action('/explore')}/>
      <FeatureCard kicker="DISCOVER" title="Add a missing place" body="Use an address, map coordinates, remote knowledge, photos, GPS or live on-site evidence." onPress={action('/discover')}/>
      <FeatureCard kicker="PROGRESS" title="XP + levels" body="See specialties, quests, missions, challenges, journeys, campaigns, contests, badges and rankings." onPress={action('/play')}/>
      <FeatureCard kicker="SCAN" title="QR check-in" body="Resolve Kleenest QR actions and verified trust missions through one canonical path." onPress={action('/qr')}/>
      <FeatureCard kicker="SAVED" title="Trusted shortlist" body="Return to bathrooms you trust or want to verify again." onPress={action('/saved')}/>
      <FeatureCard kicker="ROUTE" title="Plan smarter" body="Build a bathroom-first route around the stops that matter." onPress={action('/route')}/>
      <FeatureCard kicker="OFFLINE" title="Take routes with you" body="Prepare canonical route discovery and restroom packs before coverage gets weak." onPress={action('/offline')}/>
      <FeatureCard kicker="ACTIVITY" title="Your impact" body="See visits, discoveries, reviews, evidence, rewards and network contributions." onPress={action('/activity')}/>
    </View>

    <SectionHeader eyebrow="THE KLEENEST LOOP" title="Discovery creates the network" body="A place can start as a remote candidate and become stronger through coordinates, photos, fresh GPS evidence and independent confirmation."/>
    <View style={s.loopCard}>
      {['Explore','Discover','Document','Verify','Strengthen trust','Earn XP'].map((label,index)=><View style={s.loopStep} key={label}><View style={s.loopNumber}><Text style={s.loopNumberText}>{index+1}</Text></View><Text style={s.loopLabel}>{label}</Text>{index<5?<Text style={s.loopArrow}>→</Text>:null}</View>)}
    </View>
    <View style={s.actionBand}><View style={{flex:1}}><Text style={s.actionBandTitle}>Your contribution has a progression path</Text><Text style={s.actionBandBody}>Remote discovery earns useful XP. GPS-supported evidence earns more. Fresh on-site evidence earns the strongest discovery weighting. The same verified action advances your levels and eligible objectives without duplicate rewards.</Text></View><Pressable style={s.actionBandButton} onPress={action('/play')}><Text style={s.actionBandButtonText}>VIEW PROGRESS</Text></Pressable></View>

    <SectionHeader eyebrow="KLEENEST AI" title="Assistance without a second source of truth" body="AI interprets the canonical Kleenest context you choose. It never invents locations, trust facts, or actions."/>
    <View style={s.aiBand}><View style={{flex:1}}><Text style={s.aiTitle}>Trust guide · route guide · review drafting</Text><Text style={s.aiBody}>Explain evidence for a saved restroom, reason about saved route stops, or draft a review from facts you personally provide.</Text></View><Pressable style={s.aiButton} onPress={action('/assistant')}><Text style={s.aiButtonText}>OPEN KLEENEST AI</Text></Pressable></View>

    <SectionHeader eyebrow="YOUR NETWORK" title="Community makes the map smarter" body="Follow useful contributors, inspect verified evidence, message people you trust, and see what your network is learning about local bathrooms."/>
    <View style={s.stack}>
      <FeatureCard kicker="COMMUNITY" title="People helping people" body="Followers, contributor reputation, verified reviews and community evidence." onPress={action('/social')}/>
      <FeatureCard kicker="MESSAGES" title="Talk directly" body="Participant-only messages with contributors in your trusted network." onPress={action('/messages')}/>
      <FeatureCard kicker="ACCESS" title="Preferred + single-use" body="Use partner-scoped preferred locations and single-use restroom access when the backend says you are eligible." onPress={action('/access')}/>
      <FeatureCard kicker="PROFILE" title="Your Kleenest identity" body="Progression, reputation, badges, contribution history, privacy, membership and account controls." onPress={action('/profile')}/>
      <FeatureCard kicker="NOTIFICATIONS" title="Stay current" body="Restroom updates, community activity, rewards and trust opportunities." onPress={action('/notifications')}/>
    </View>

    <SectionHeader eyebrow="MORE" title="Everything else stays close"/>
    <View style={s.moreRow}>
      <Pressable style={s.more} onPress={action('/membership')}><Text style={s.moreTitle}>Membership</Text><Text style={s.moreBody}>Ad-free Premium option</Text></Pressable>
      <Pressable style={s.more} onPress={action('/games')}><Text style={s.moreTitle}>Game Center</Text><Text style={s.moreBody}>Games + challenges</Text></Pressable>
      <Pressable style={s.more} onPress={action('/support')}><Text style={s.moreTitle}>Support</Text><Text style={s.moreBody}>Help + feedback</Text></Pressable>
    </View>
    <Text style={s.footer}>Kleenest gets better when every useful discovery makes the network smarter.</Text>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:palette.canvas},content:{padding:20,paddingBottom:44,gap:15},brandRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:2},brand:{fontSize:14,fontWeight:'900',letterSpacing:2.8,color:palette.green},brandSub:{fontSize:10,fontWeight:'800',color:'#708077',marginTop:2},profileChip:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,paddingHorizontal:12,paddingVertical:8,borderRadius:999},profileChipText:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},heroActions:{flexDirection:'row',gap:9,marginTop:10},heroPrimary:{flex:1,backgroundColor:'#fff',padding:14,borderRadius:16},heroPrimaryLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#557060'},heroPrimaryTitle:{fontSize:16,fontWeight:'900',color:palette.green,marginTop:3},heroSecondary:{minWidth:132,backgroundColor:'#2b513e',padding:14,borderRadius:16},heroSecondaryLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#bcd4c5'},heroSecondaryTitle:{fontSize:14,fontWeight:'900',color:'#fff',marginTop:3},twoCol:{flexDirection:'row',flexWrap:'wrap',gap:10},stack:{gap:9},aiBand:{backgroundColor:'#e8f2ec',borderRadius:20,borderWidth:1,borderColor:'#cfe0d5',padding:16,gap:12},aiTitle:{fontSize:19,fontWeight:'900',color:palette.ink},aiBody:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:4},aiButton:{alignSelf:'flex-start',backgroundColor:palette.green,paddingHorizontal:14,paddingVertical:11,borderRadius:12},aiButtonText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},loopCard:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:20,padding:15,flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},loopStep:{flexDirection:'row',alignItems:'center',gap:5},loopNumber:{width:22,height:22,borderRadius:11,backgroundColor:palette.mint,alignItems:'center',justifyContent:'center'},loopNumberText:{fontSize:10,fontWeight:'900',color:palette.green},loopLabel:{fontSize:11,fontWeight:'900',color:palette.ink},loopArrow:{fontSize:13,fontWeight:'900',color:'#8b9a91'},actionBand:{backgroundColor:'#eaf3ed',borderRadius:20,borderWidth:1,borderColor:'#cfe0d5',padding:16,gap:12},actionBandTitle:{fontSize:19,fontWeight:'900',color:palette.ink},actionBandBody:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:4},actionBandButton:{alignSelf:'flex-start',backgroundColor:palette.green,paddingHorizontal:14,paddingVertical:11,borderRadius:12},actionBandButtonText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},moreRow:{flexDirection:'row',gap:8},more:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:16,padding:12},moreTitle:{fontSize:12,fontWeight:'900',color:palette.green},moreBody:{fontSize:10,lineHeight:14,color:palette.muted,marginTop:3},footer:{fontSize:11,fontWeight:'700',color:'#7a8980',textAlign:'center',marginTop:9}});
