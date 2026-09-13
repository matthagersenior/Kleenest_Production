import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { palette } from './ConsumerUI';

const go=(route:string)=>()=>router.push(route as any);

function useMarketingMeta(title:string,description:string){
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const doc=(globalThis as any).document;
    if(!doc)return;
    doc.title=title;
    const meta=doc.querySelector?.('meta[name="description"]');
    if(meta)meta.setAttribute('content',description);
  },[description,title]);
}

function Pill({children,inverse=false}:{children:string;inverse?:boolean}){
  return <View style={[s.pill,inverse&&s.pillInverse]}><Text style={[s.pillText,inverse&&s.pillTextInverse]}>{children}</Text></View>;
}

function SiteHeader(){
  return <View style={[s.header,Platform.OS==='web'?({position:'sticky',top:0,zIndex:50} as any):null]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Kleenest home" onPress={go('/')} style={s.brandLockup}>
      <View style={s.brandMark}><Text style={s.brandMarkText}>K</Text></View>
      <View><Text style={s.brandName}>KLEENEST</Text><Text style={s.brandTag}>Know before you go.</Text></View>
    </Pressable>
    <View style={s.nav}>
      <Pressable style={s.navLink} onPress={go('/for-you')}><Text style={s.navLinkText}>For You</Text></Pressable>
      <Pressable style={s.navLink} onPress={go('/for-business')}><Text style={s.navLinkText}>For Business</Text></Pressable>
      <Pressable style={s.navLink} onPress={go('/trust')}><Text style={s.navLinkText}>Trust</Text></Pressable>
      <Pressable style={s.openApp} onPress={go('/explore')}><Text style={s.openAppText}>Open App</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Install Kleenest now" style={s.installTop} onPress={go('/install')}><Text style={s.installTopText}>Install Now</Text></Pressable>
    </View>
  </View>;
}

function SiteShell({children}:{children:React.ReactNode}){
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
    <SiteHeader/>
    <View style={s.siteBody}>{children}</View>
    <View style={s.footer}>
      <View><Text style={s.footerBrand}>KLEENEST</Text><Text style={s.footerCopy}>Fresh community evidence for better bathroom decisions.</Text></View>
      <View style={s.footerLinks}>
        <Pressable onPress={go('/for-you')}><Text style={s.footerLink}>For You</Text></Pressable>
        <Pressable onPress={go('/for-business')}><Text style={s.footerLink}>For Business</Text></Pressable>
        <Pressable onPress={go('/trust')}><Text style={s.footerLink}>Trust</Text></Pressable>
        <Pressable onPress={go('/install')}><Text style={s.footerLink}>Install</Text></Pressable>
        <Pressable onPress={go('/support')}><Text style={s.footerLink}>Support</Text></Pressable>
      </View>
    </View>
  </ScrollView></SafeAreaView>;
}

function MockPhone(){
  const places=[
    {name:'Riverfront Market',distance:'0.3 mi',score:'4.8',fresh:'Verified 9m ago',detail:'Accessible · changing table · open now'},
    {name:'Central Library',distance:'0.6 mi',score:'4.7',fresh:'Verified 24m ago',detail:'Free access · family restroom'},
    {name:'Coffee House',distance:'0.8 mi',score:'4.5',fresh:'Verified 1h ago',detail:'Customer access · clean + stocked'},
  ];
  return <View style={s.phone}>
    <View style={s.phoneBar}><Text style={s.phoneBrand}>KLEENEST</Text><Text style={s.phoneSignal}>LIVE</Text></View>
    <Text style={s.phoneTitle}>Best bathroom nearby</Text>
    <Text style={s.phoneSub}>Fresh evidence, not just a pin.</Text>
    <View style={s.searchBox}><Text style={s.searchText}>Downtown · within 5 miles</Text></View>
    <View style={s.placeList}>{places.map((place,index)=><View style={[s.placeRow,index===0&&s.placeRowBest]} key={place.name}>
      <View style={s.placeScore}><Text style={s.placeScoreText}>{place.score}</Text><Text style={s.placeStar}>★</Text></View>
      <View style={s.placeCopy}><View style={s.placeTitleRow}><Text style={s.placeName}>{place.name}</Text><Text style={s.placeDistance}>{place.distance}</Text></View><Text style={s.placeFresh}>{place.fresh}</Text><Text style={s.placeDetail}>{place.detail}</Text></View>
    </View>)}</View>
    <View style={s.phoneActions}><View style={s.phoneActionPrimary}><Text style={s.phoneActionPrimaryText}>START NAV</Text></View><View style={s.phoneActionSecondary}><Text style={s.phoneActionSecondaryText}>ADD TO ROUTE</Text></View></View>
  </View>;
}

function SectionIntro({eyebrow,title,body}:{eyebrow:string;title:string;body:string}){
  return <View style={s.sectionIntro}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionBody}>{body}</Text></View>;
}

function Feature({kicker,title,body}:{kicker:string;title:string;body:string}){
  return <View style={s.feature}><Text style={s.featureKicker}>{kicker}</Text><Text style={s.featureTitle}>{title}</Text><Text style={s.featureBody}>{body}</Text></View>;
}

const consumerFeatures=[
  {kicker:'FIND',title:'Choose with confidence',body:'See cleanliness, access, amenities, distance and fresh verification context before you commit to the stop.'},
  {kicker:'PLAY',title:'XP that means something',body:'Earn progression through useful discoveries and evidence, then climb levels, leaderboards and specialties.'},
  {kicker:'COMPETE',title:'Quests, contests + challenges',body:'Turn real-world contributions into missions, campaigns, badges, contests and community challenges.'},
  {kicker:'PLAN',title:'Routes built around real needs',body:'Save trusted bathrooms, add stops to a route, prepare offline and make the next stop part of the plan.'},
];

const businessFeatures=[
  {kicker:'DISCOVERY',title:'Be the stop people choose',body:'Keep restroom access, amenities, hours and location details accurate so the right customers can find you.'},
  {kicker:'TRUST',title:'Turn cleanliness into reputation',body:'Respond to reviews, publish updates, resolve issues and build a fresher evidence trail around the customer experience.'},
  {kicker:'ENGAGEMENT',title:'Make visits measurable',body:'Use QR check-ins, campaigns, promotions, contests and events to connect physical visits with customer engagement.'},
  {kicker:'OPERATIONS',title:'Act on what customers see',body:'Use analytics, issue trends, reverification and remediation workflows to improve locations instead of only reading reviews.'},
];

const scenarios=[
  {scene:'ROAD TRIP',title:'The next reliable stop',place:'Travel stop ahead',meta:'7.2 mi · 4.8 ★',fresh:'Verified 14 min ago',signal:'Open 24h · family restroom · accessible'},
  {scene:'DOWNTOWN',title:'A clean option before the meeting',place:'Public lobby restroom',meta:'0.4 mi · 4.7 ★',fresh:'Verified 31 min ago',signal:'Free access · stocked · low wait'},
  {scene:'FAMILY DAY',title:'Amenities that matter',place:'Museum family restroom',meta:'0.8 mi · 4.9 ★',fresh:'Verified 42 min ago',signal:'Changing table · family room · stroller-friendly'},
  {scene:'EVENT NIGHT',title:'Know before the crowd',place:'Venue concourse restroom',meta:'Gate C · 4.5 ★',fresh:'Verified 6 min ago',signal:'High traffic · stocked · accessible stall confirmed'},
];

export function MarketingHome(){
  const{width}=useWindowDimensions();
  const wide=width>=900;
  useMarketingMeta('Kleenest | Find bathrooms you can trust','Kleenest helps people find cleaner, better-equipped bathrooms using fresh community evidence, trusted reviews, routes, rewards and real-world verification.');
  return <SiteShell>
    <View style={[s.hero,wide&&s.heroWide]}>
      <View style={s.heroCopy}>
        <View style={s.heroPills}><Pill inverse>FRESH EVIDENCE</Pill><Pill inverse>COMMUNITY VERIFIED</Pill><Pill inverse>BUILT FOR REAL LIFE</Pill></View>
        <Text style={[s.heroTitle,!wide&&s.heroTitleNarrow]}>Clean bathrooms shouldn’t be a gamble.</Text>
        <Text style={s.heroBody}>Kleenest helps you find a bathroom you can trust—using fresh reviews, real check-ins, amenity evidence and community verification that gets stronger every time people contribute.</Text>
        <View style={s.heroButtons}>
          <Pressable style={s.heroPrimary} onPress={go('/install')}><Text style={s.heroPrimaryText}>INSTALL KLEENEST</Text></Pressable>
          <Pressable style={s.heroSecondary} onPress={go('/explore')}><Text style={s.heroSecondaryText}>TRY THE WEB APP</Text></Pressable>
        </View>
        <View style={s.heroProof}><Text style={s.heroProofText}>Find it.</Text><Text style={s.heroArrow}>→</Text><Text style={s.heroProofText}>Verify it.</Text><Text style={s.heroArrow}>→</Text><Text style={s.heroProofText}>Make it better for everyone.</Text></View>
      </View>
      <MockPhone/>
    </View>

    <View style={s.signalBand}>
      {[['FRESHNESS','When was it actually verified?'],['TRUST','How much independent evidence supports it?'],['DETAIL','Is it clean, open and equipped for what you need?'],['COMMUNITY','Can your visit make the next person’s choice easier?']].map(([title,body])=><View style={s.signal} key={title}><Text style={s.signalTitle}>{title}</Text><Text style={s.signalBody}>{body}</Text></View>)}
    </View>

    <View style={s.section}>
      <SectionIntro eyebrow="WHY KLEENEST" title="A bathroom can change the whole stop." body="Clean, usable restrooms affect comfort, dignity, family travel, workdays, road trips and how people remember a business. Kleenest makes that invisible part of the experience easier to see before you walk through the door."/>
      <View style={s.reasonGrid}>
        {[
          ['FOR EVERYDAY LIFE','Less guessing. Less backtracking. Better stops when time matters.'],
          ['FOR FAMILIES','Find changing tables, family restrooms, accessibility and practical amenities before arrival.'],
          ['FOR TRAVEL','Plan around bathrooms you actually want to use instead of hoping the next exit works out.'],
          ['FOR BUSINESSES','A visibly clean, well-managed restroom can become part of the reason customers choose—and remember—you.'],
        ].map(([title,body])=><View style={s.reason} key={title}><Text style={s.reasonTitle}>{title}</Text><Text style={s.reasonBody}>{body}</Text></View>)}
      </View>
    </View>

    <View style={[s.splitSection,wide&&s.splitSectionWide]}>
      <View style={s.splitLead}><Text style={s.eyebrow}>FOR YOU</Text><Text style={s.splitTitle}>Useful first. Fun enough to come back.</Text><Text style={s.splitBody}>The clean-bathroom problem gets solved first. Then your discoveries, check-ins and verification can power XP, levels, quests, contests, leaderboards, badges and a stronger community map.</Text><View style={s.inlineActions}><Pressable style={s.darkButton} onPress={go('/for-you')}><Text style={s.darkButtonText}>SEE YOUR BENEFITS</Text></Pressable><Pressable style={s.lightButton} onPress={go('/signup')}><Text style={s.lightButtonText}>JOIN KLEENEST</Text></Pressable></View></View>
      <View style={s.featureGrid}>{consumerFeatures.map(item=><Feature key={item.title} {...item}/>)}</View>
    </View>

    <View style={[s.splitSection,s.businessSection,wide&&s.splitSectionWide]}>
      <View style={s.splitLead}><Text style={s.eyebrow}>FOR BUSINESS</Text><Text style={s.splitTitle}>Turn restroom quality into a visible advantage.</Text><Text style={s.splitBody}>Kleenest is more than a review page. Businesses can manage information, QR experiences, reviews and replies, customer engagement, analytics, issue response, reverification and operational improvement from the same ecosystem.</Text><View style={s.inlineActions}><Pressable style={s.darkButton} onPress={go('/for-business')}><Text style={s.darkButtonText}>EXPLORE BUSINESS VALUE</Text></Pressable></View></View>
      <View style={s.featureGrid}>{businessFeatures.map(item=><Feature key={item.title} {...item}/>)}</View>
    </View>

    <View style={s.trustSection}>
      <View style={s.trustCopy}><Text style={s.eyebrowLight}>TRUST + FRESHNESS</Text><Text style={s.trustTitle}>A five-star review from last year is not enough.</Text><Text style={s.trustBody}>Bathroom conditions change. Kleenest is designed around recency, repeated independent evidence and clear signals about what was actually observed. Fresh contributions strengthen confidence; stale information creates a reason to verify again.</Text><Pressable style={s.trustButton} onPress={go('/trust')}><Text style={s.trustButtonText}>HOW KLEENEST TRUST WORKS</Text></Pressable></View>
      <View style={s.trustFlow}>
        {[
          ['1','DISCOVER','A place enters the network.'],
          ['2','VERIFY','People confirm access, condition and amenities.'],
          ['3','REFRESH','New visits keep the evidence current.'],
          ['4','IMPROVE','Users and businesses respond to what changed.'],
        ].map(([num,title,body])=><View style={s.flowStep} key={num}><View style={s.flowNum}><Text style={s.flowNumText}>{num}</Text></View><View><Text style={s.flowTitle}>{title}</Text><Text style={s.flowBody}>{body}</Text></View></View>)}
      </View>
    </View>

    <View style={s.section}>
      <SectionIntro eyebrow="KLEENEST ANYWHERE" title="The same trust layer, wherever the day takes you." body="Kleenest can make the restroom decision feel familiar whether you are crossing a city, crossing a state, taking kids out for the day or entering a packed venue."/>
      <View style={s.scenarioGrid}>{scenarios.map(item=><View style={s.scenario} key={item.scene}><View style={s.scenarioTop}><Text style={s.scenarioScene}>{item.scene}</Text><Text style={s.scenarioFresh}>{item.fresh}</Text></View><Text style={s.scenarioTitle}>{item.title}</Text><View style={s.scenarioCard}><View><Text style={s.scenarioPlace}>{item.place}</Text><Text style={s.scenarioMeta}>{item.meta}</Text></View><Text style={s.scenarioSignal}>{item.signal}</Text></View></View>)}</View>
    </View>

    <View style={s.finalCta}>
      <Text style={s.finalEyebrow}>READY WHEN YOU NEED IT</Text><Text style={s.finalTitle}>Put Kleenest one tap away.</Text><Text style={s.finalBody}>Install the web app on your phone, tablet or computer, or open Kleenest in your browser right now.</Text>
      <View style={s.heroButtons}><Pressable style={s.heroPrimaryLight} onPress={go('/install')}><Text style={s.heroPrimaryLightText}>INSTALL NOW</Text></Pressable><Pressable style={s.heroSecondaryDark} onPress={go('/explore')}><Text style={s.heroSecondaryDarkText}>OPEN WEB APP</Text></Pressable></View>
    </View>
  </SiteShell>;
}

const forYouGroups=[
  {title:'Find the right bathroom faster',body:'Start with the practical decision: where should I go?',items:['Search near you or around any address','Compare distance, cleanliness and freshness','See amenities, access and practical details','Save trusted places and start navigation','Build bathroom-aware routes and offline plans']},
  {title:'Make every contribution count',body:'Useful evidence can improve both your experience and the network.',items:['Check in when you are actually there','Review cleanliness and condition','Confirm amenities and access','Add missing places and fresh observations','See your activity and community impact']},
  {title:'Progress through the real world',body:'Kleenest turns useful participation into progression without making the utility secondary.',items:['XP, levels and specialties','Quests, missions and journeys','Badges, rankings and leaderboards','Contests, challenges and campaigns','Community recognition for useful evidence']},
  {title:'Stay connected and in control',body:'Follow people whose evidence you trust and keep your account useful across devices.',items:['Community activity and contributor reputation','Following, followers and messaging','Notifications for relevant updates','Individual, Premium and Family paths','Privacy, support and account controls']},
];

export function ForYouMarketingPage(){
  useMarketingMeta('Kleenest for You | Find, verify, earn and explore','See the consumer benefits of Kleenest: trusted bathroom discovery, fresh evidence, routes, XP, quests, contests, leaderboards and community.');
  return <SiteShell><DetailHero eyebrow="FOR YOU" title="A better bathroom stop—and a reason to make the map better." body="Kleenest starts with a simple promise: help you make a better restroom decision. Everything else—community, XP, quests, contests and rankings—rewards the useful actions that keep that promise fresh." primary="INSTALL NOW" secondary="OPEN THE APP"/>
    <View style={s.detailGrid}>{forYouGroups.map(group=><DetailGroup key={group.title} {...group}/>)}</View>
    <MiniCta title="Find your next trusted stop." body="Open Explore now or install Kleenest so it is ready when you need it."/>
  </SiteShell>;
}

const businessGroups=[
  {title:'Get discovered for the right reasons',body:'Make accurate restroom information part of the customer decision.',items:['Claim and manage business/location information','Publish restroom access, amenities and availability','Improve discovery in search, maps and routes','Use QR entry points for check-ins and reviews','Keep customer-facing details current']},
  {title:'Build and recover trust',body:'A problem does not have to become a permanent reputation problem.',items:['See reviews and evidence tied to locations','Reply to customer feedback','Track freshness and reverification needs','Manage restroom issue and remediation workflows','Show that conditions changed after action was taken']},
  {title:'Create measurable engagement',body:'Connect the physical visit to experiences that can bring customers back.',items:['QR check-ins and attributed engagement','Promotions, campaigns and offers','Contests, challenges and events','Business participation in Kleenest gamification','Location-specific engagement and redemption paths']},
  {title:'Operate with better signals',body:'Use the same customer evidence as an operational feedback loop.',items:['Location and restroom analytics','Trend and issue visibility','Preventive and follow-up workflows','Multi-location operational oversight','Freshness, confidence and verification signals']},
];

export function ForBusinessMarketingPage(){
  useMarketingMeta('Kleenest for Business | Turn clean restrooms into an advantage','Kleenest gives businesses discovery, QR, reviews, engagement, analytics, reverification and operational tools built around the restroom experience.');
  return <SiteShell><DetailHero eyebrow="FOR BUSINESS" title="Make a clean restroom part of your customer experience strategy." body="Kleenest helps businesses get found, earn trust, engage visitors and act on restroom experience data. The goal is not simply more reviews—it is a tighter loop between what customers experience and what the business can improve." primary="INSTALL KLEENEST" secondary="SEE CONSUMER EXPERIENCE"/>
    <View style={s.detailGrid}>{businessGroups.map(group=><DetailGroup key={group.title} {...group}/>)}</View>
    <View style={s.businessPromise}><Text style={s.businessPromiseEyebrow}>THE BUSINESS LOOP</Text><Text style={s.businessPromiseTitle}>Discover → visit → verify → respond → improve → earn more trust.</Text><Text style={s.businessPromiseBody}>When customers can see fresh evidence and businesses can act on that evidence, restroom quality becomes something that can be managed—not just complained about.</Text></View>
    <MiniCta title="See Kleenest from the customer side." body="Open the web app now or install it and experience the same discovery path your customers will use."/>
  </SiteShell>;
}

export function TrustMarketingPage(){
  useMarketingMeta('How Kleenest Trust Works | Freshness, evidence and verification','Learn how Kleenest uses fresh community evidence, repeated verification and clear trust signals to make restroom information more useful.');
  const signals=[
    ['FRESHNESS','How recently was the condition or amenity observed?'],
    ['CONFIDENCE','How much supporting evidence exists, and how consistent is it?'],
    ['PROVENANCE','Did the signal come from a check-in, review, photo, business update or another source?'],
    ['CONTRIBUTOR CONTEXT','Is there a pattern of useful, verified participation behind the contribution?'],
    ['CONTRADICTION','Do newer observations disagree with older ones?'],
    ['REVERIFICATION','Has enough changed—or enough time passed—that someone should check again?'],
  ];
  return <SiteShell><DetailHero eyebrow="TRUST + FRESHNESS" title="Trust should tell you what is known—and how recently it was known." body="Kleenest is designed for information that changes in the real world. A restroom can be excellent this morning, out of service this afternoon and fixed tonight. Freshness and repeated evidence matter." primary="INSTALL NOW" secondary="OPEN EXPLORE"/>
    <View style={s.trustPrinciples}><SectionIntro eyebrow="WHAT KLEENEST LOOKS FOR" title="Not just stars. Signals." body="Kleenest can present the context behind a place so the user can make a practical decision instead of treating every review as equally current or equally useful."/><View style={s.signalCardGrid}>{signals.map(([title,body])=><View style={s.signalCard} key={title}><Text style={s.signalCardTitle}>{title}</Text><Text style={s.signalCardBody}>{body}</Text></View>)}</View></View>
    <View style={s.trustLifecycle}><Text style={s.eyebrowLight}>THE FRESHNESS LOOP</Text><Text style={s.trustTitle}>A place earns trust continuously.</Text><View style={s.lifecycleGrid}>{[
      ['DISCOVER','A candidate appears from a user, business or other supported source.'],
      ['OBSERVE','Someone checks what is actually there.'],
      ['VERIFY','Independent evidence confirms—or challenges—the current picture.'],
      ['USE','People make decisions from the newest supported information.'],
      ['REFRESH','New visits update what has changed.'],
      ['REPAIR','Businesses and the community can close the loop after a problem.'],
    ].map(([title,body],index)=><View style={s.lifecycleItem} key={title}><Text style={s.lifecycleNum}>{String(index+1).padStart(2,'0')}</Text><Text style={s.lifecycleTitle}>{title}</Text><Text style={s.lifecycleBody}>{body}</Text></View>)}</View></View>
    <MiniCta title="Help keep the map fresh." body="Install Kleenest, verify what you actually see and make the next person’s decision easier."/>
  </SiteShell>;
}

function DetailHero({eyebrow,title,body,primary,secondary}:{eyebrow:string;title:string;body:string;primary:string;secondary:string}){
  return <View style={s.detailHero}><Text style={s.eyebrowLight}>{eyebrow}</Text><Text style={s.detailHeroTitle}>{title}</Text><Text style={s.detailHeroBody}>{body}</Text><View style={s.heroButtons}><Pressable style={s.heroPrimaryLight} onPress={go('/install')}><Text style={s.heroPrimaryLightText}>{primary}</Text></Pressable><Pressable style={s.heroSecondaryDark} onPress={go('/explore')}><Text style={s.heroSecondaryDarkText}>{secondary}</Text></Pressable></View></View>;
}

function DetailGroup({title,body,items}:{title:string;body:string;items:string[]}){
  return <View style={s.detailGroup}><Text style={s.detailGroupTitle}>{title}</Text><Text style={s.detailGroupBody}>{body}</Text><View style={s.detailItems}>{items.map(item=><View style={s.detailItem} key={item}><Text style={s.detailBullet}>✓</Text><Text style={s.detailItemText}>{item}</Text></View>)}</View></View>;
}

function MiniCta({title,body}:{title:string;body:string}){
  return <View style={s.miniCta}><View style={{flex:1}}><Text style={s.miniCtaTitle}>{title}</Text><Text style={s.miniCtaBody}>{body}</Text></View><View style={s.inlineActions}><Pressable style={s.darkButton} onPress={go('/install')}><Text style={s.darkButtonText}>INSTALL NOW</Text></Pressable><Pressable style={s.lightButton} onPress={go('/explore')}><Text style={s.lightButtonText}>OPEN APP</Text></Pressable></View></View>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#eef3ef'},
  scroll:{backgroundColor:'#eef3ef'},
  header:{width:'100%',maxWidth:1240,alignSelf:'center',backgroundColor:'rgba(255,255,255,.97)' as any,borderBottomWidth:1,borderBottomColor:'#dce6df',paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},
  brandLockup:{flexDirection:'row',alignItems:'center',gap:10},
  brandMark:{width:38,height:38,borderRadius:13,backgroundColor:palette.green,alignItems:'center',justifyContent:'center'},
  brandMarkText:{color:'#fff',fontSize:20,fontWeight:'900'},
  brandName:{fontSize:13,fontWeight:'900',letterSpacing:2.6,color:palette.green},
  brandTag:{fontSize:9,fontWeight:'800',color:'#718077',marginTop:2},
  nav:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap',justifyContent:'flex-end'},
  navLink:{paddingHorizontal:9,paddingVertical:8,borderRadius:10},
  navLinkText:{fontSize:11,fontWeight:'900',color:'#3f5548'},
  openApp:{paddingHorizontal:11,paddingVertical:9,borderRadius:11,backgroundColor:'#e8f2ec'},
  openAppText:{fontSize:10,fontWeight:'900',color:palette.green},
  installTop:{paddingHorizontal:13,paddingVertical:10,borderRadius:11,backgroundColor:palette.green},
  installTopText:{fontSize:10,fontWeight:'900',color:'#fff'},
  siteBody:{width:'100%',maxWidth:1240,alignSelf:'center',paddingHorizontal:18,paddingTop:18,paddingBottom:34,gap:20},
  hero:{backgroundColor:palette.green,borderRadius:32,padding:26,gap:24,overflow:'hidden'},
  heroWide:{flexDirection:'row',alignItems:'center',padding:38},
  heroCopy:{flex:1,gap:13},
  heroPills:{flexDirection:'row',flexWrap:'wrap',gap:7},
  pill:{alignSelf:'flex-start',backgroundColor:'#e8f2ec',paddingHorizontal:9,paddingVertical:6,borderRadius:999},
  pillInverse:{backgroundColor:'rgba(255,255,255,.12)' as any,borderWidth:1,borderColor:'rgba(255,255,255,.15)' as any},
  pillText:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:palette.green},
  pillTextInverse:{color:'#e8f4ec'},
  heroTitle:{fontSize:50,lineHeight:52,fontWeight:'900',letterSpacing:-1.8,color:'#fff',maxWidth:650},
  heroTitleNarrow:{fontSize:38,lineHeight:41},
  heroBody:{fontSize:16,lineHeight:25,color:'#e0ece4',maxWidth:680},
  heroButtons:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:4},
  heroPrimary:{backgroundColor:'#fff',paddingHorizontal:17,paddingVertical:13,borderRadius:13},
  heroPrimaryText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:palette.green},
  heroSecondary:{backgroundColor:'rgba(255,255,255,.10)' as any,borderWidth:1,borderColor:'rgba(255,255,255,.22)' as any,paddingHorizontal:17,paddingVertical:13,borderRadius:13},
  heroSecondaryText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},
  heroProof:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7,marginTop:2},
  heroProofText:{fontSize:11,fontWeight:'900',color:'#c9ddd0'},
  heroArrow:{fontSize:12,color:'#84a994'},
  phone:{flex:1,minWidth:290,maxWidth:440,backgroundColor:'#f8fbf9',borderRadius:28,padding:17,borderWidth:7,borderColor:'#102218',gap:9,shadowColor:'#000',shadowOpacity:.22,shadowRadius:24,shadowOffset:{width:0,height:15}},
  phoneBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  phoneBrand:{fontSize:10,fontWeight:'900',letterSpacing:1.6,color:palette.green},
  phoneSignal:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:'#2d6948',backgroundColor:'#dcecdf',paddingHorizontal:7,paddingVertical:4,borderRadius:999},
  phoneTitle:{fontSize:21,fontWeight:'900',color:palette.ink},
  phoneSub:{fontSize:11,color:palette.muted,fontWeight:'700'},
  searchBox:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d9e5dc',borderRadius:12,padding:10},
  searchText:{fontSize:10,fontWeight:'800',color:'#506258'},
  placeList:{gap:7},
  placeRow:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dde7e0',borderRadius:15,padding:10,flexDirection:'row',gap:10},
  placeRowBest:{borderWidth:2,borderColor:'#84ab92'},
  placeScore:{width:41,height:41,borderRadius:13,backgroundColor:'#e4f0e8',alignItems:'center',justifyContent:'center'},
  placeScoreText:{fontSize:13,fontWeight:'900',color:palette.green},
  placeStar:{fontSize:8,color:'#986c20',marginTop:-2},
  placeCopy:{flex:1,gap:2},
  placeTitleRow:{flexDirection:'row',justifyContent:'space-between',gap:8},
  placeName:{fontSize:11,fontWeight:'900',color:palette.ink,flex:1},
  placeDistance:{fontSize:9,fontWeight:'900',color:palette.muted},
  placeFresh:{fontSize:9,fontWeight:'900',color:'#2d6948'},
  placeDetail:{fontSize:8,lineHeight:12,color:'#718077'},
  phoneActions:{flexDirection:'row',gap:7},
  phoneActionPrimary:{flex:1,backgroundColor:palette.green,borderRadius:11,padding:9,alignItems:'center'},
  phoneActionPrimaryText:{fontSize:8,fontWeight:'900',color:'#fff'},
  phoneActionSecondary:{flex:1,backgroundColor:'#e8f2ec',borderRadius:11,padding:9,alignItems:'center'},
  phoneActionSecondaryText:{fontSize:8,fontWeight:'900',color:palette.green},
  signalBand:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dce6df',borderRadius:22,padding:18,flexDirection:'row',flexWrap:'wrap',gap:12},
  signal:{flexGrow:1,flexBasis:220,minWidth:190},
  signalTitle:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  signalBody:{fontSize:12,lineHeight:18,color:palette.muted,marginTop:4,fontWeight:'700'},
  section:{paddingVertical:20,gap:17},
  sectionIntro:{maxWidth:800,gap:5},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:palette.green},
  eyebrowLight:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:'#bad2c2'},
  sectionTitle:{fontSize:32,lineHeight:36,fontWeight:'900',letterSpacing:-.7,color:palette.ink},
  sectionBody:{fontSize:14,lineHeight:22,color:palette.muted,maxWidth:760},
  reasonGrid:{flexDirection:'row',flexWrap:'wrap',gap:11},
  reason:{flexGrow:1,flexBasis:250,minWidth:230,backgroundColor:'#fff',borderRadius:19,padding:16,borderWidth:1,borderColor:'#dce6df'},
  reasonTitle:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:palette.green},
  reasonBody:{fontSize:13,lineHeight:20,color:'#53675b',marginTop:6,fontWeight:'700'},
  splitSection:{backgroundColor:'#e5eee8',borderRadius:28,padding:22,gap:18},
  businessSection:{backgroundColor:'#f1eee5'},
  splitSectionWide:{flexDirection:'row',alignItems:'stretch',padding:28},
  splitLead:{flex:1,gap:7,minWidth:250},
  splitTitle:{fontSize:31,lineHeight:35,fontWeight:'900',color:palette.ink,letterSpacing:-.6},
  splitBody:{fontSize:14,lineHeight:22,color:palette.muted},
  inlineActions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:7},
  darkButton:{backgroundColor:palette.green,borderRadius:12,paddingHorizontal:14,paddingVertical:11},
  darkButtonText:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:'#fff'},
  lightButton:{backgroundColor:'#fff',borderWidth:1,borderColor:'#cadbd0',borderRadius:12,paddingHorizontal:14,paddingVertical:11},
  lightButtonText:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:palette.green},
  featureGrid:{flex:1.2,flexDirection:'row',flexWrap:'wrap',gap:10},
  feature:{flexGrow:1,flexBasis:220,minWidth:210,backgroundColor:'#fff',borderRadius:18,padding:15,borderWidth:1,borderColor:'#d8e3dc'},
  featureKicker:{fontSize:8,fontWeight:'900',letterSpacing:.9,color:palette.green},
  featureTitle:{fontSize:17,lineHeight:21,fontWeight:'900',color:palette.ink,marginTop:4},
  featureBody:{fontSize:12,lineHeight:18,color:palette.muted,marginTop:5},
  trustSection:{backgroundColor:'#102218',borderRadius:28,padding:25,gap:21},
  trustCopy:{gap:8,maxWidth:770},
  trustTitle:{fontSize:32,lineHeight:36,fontWeight:'900',color:'#fff',letterSpacing:-.6},
  trustBody:{fontSize:14,lineHeight:22,color:'#ccddd2'},
  trustButton:{alignSelf:'flex-start',backgroundColor:'#e8f2ec',borderRadius:12,paddingHorizontal:14,paddingVertical:11,marginTop:5},
  trustButtonText:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:palette.green},
  trustFlow:{flexDirection:'row',flexWrap:'wrap',gap:9},
  flowStep:{flexGrow:1,flexBasis:220,minWidth:200,flexDirection:'row',gap:10,backgroundColor:'#173629',borderRadius:16,padding:13,borderWidth:1,borderColor:'#2d4e3c'},
  flowNum:{width:28,height:28,borderRadius:14,backgroundColor:'#dbece1',alignItems:'center',justifyContent:'center'},
  flowNumText:{fontSize:10,fontWeight:'900',color:palette.green},
  flowTitle:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:'#fff'},
  flowBody:{fontSize:11,lineHeight:16,color:'#bfd0c5',marginTop:3},
  scenarioGrid:{flexDirection:'row',flexWrap:'wrap',gap:11},
  scenario:{flexGrow:1,flexBasis:265,minWidth:240,backgroundColor:'#fff',borderRadius:20,padding:15,borderWidth:1,borderColor:'#dbe5de',gap:7},
  scenarioTop:{flexDirection:'row',justifyContent:'space-between',gap:10},
  scenarioScene:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  scenarioFresh:{fontSize:9,fontWeight:'900',color:'#2e6b49'},
  scenarioTitle:{fontSize:17,fontWeight:'900',color:palette.ink},
  scenarioCard:{backgroundColor:'#eef5f0',borderRadius:14,padding:12,gap:8},
  scenarioPlace:{fontSize:13,fontWeight:'900',color:palette.ink},
  scenarioMeta:{fontSize:10,fontWeight:'800',color:palette.muted,marginTop:2},
  scenarioSignal:{fontSize:10,lineHeight:15,color:'#4e6557',fontWeight:'700'},
  finalCta:{backgroundColor:palette.green,borderRadius:28,padding:28,gap:8,alignItems:'flex-start'},
  finalEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:'#bcd4c5'},
  finalTitle:{fontSize:34,lineHeight:38,fontWeight:'900',color:'#fff'},
  finalBody:{fontSize:14,lineHeight:21,color:'#dce9e1',maxWidth:700},
  heroPrimaryLight:{backgroundColor:'#fff',paddingHorizontal:17,paddingVertical:13,borderRadius:13},
  heroPrimaryLightText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:palette.green},
  heroSecondaryDark:{backgroundColor:'#244537',borderWidth:1,borderColor:'#3b5b4b',paddingHorizontal:17,paddingVertical:13,borderRadius:13},
  heroSecondaryDarkText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:'#fff'},
  detailHero:{backgroundColor:palette.green,borderRadius:30,padding:31,gap:10},
  detailHeroTitle:{fontSize:40,lineHeight:44,fontWeight:'900',letterSpacing:-1.1,color:'#fff',maxWidth:850},
  detailHeroBody:{fontSize:15,lineHeight:24,color:'#dce9e1',maxWidth:820},
  detailGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},
  detailGroup:{flexGrow:1,flexBasis:470,minWidth:280,backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe5de',borderRadius:22,padding:19,gap:8},
  detailGroupTitle:{fontSize:21,lineHeight:25,fontWeight:'900',color:palette.ink},
  detailGroupBody:{fontSize:13,lineHeight:20,color:palette.muted},
  detailItems:{gap:7,marginTop:3},
  detailItem:{flexDirection:'row',alignItems:'flex-start',gap:8},
  detailBullet:{fontSize:11,fontWeight:'900',color:'#2b6c49',marginTop:2},
  detailItemText:{flex:1,fontSize:12,lineHeight:18,color:'#42594c',fontWeight:'700'},
  miniCta:{backgroundColor:'#e6efe9',borderWidth:1,borderColor:'#cfddd4',borderRadius:22,padding:19,flexDirection:'row',alignItems:'center',gap:14,flexWrap:'wrap'},
  miniCtaTitle:{fontSize:21,fontWeight:'900',color:palette.ink},
  miniCtaBody:{fontSize:12,lineHeight:18,color:palette.muted,marginTop:4},
  businessPromise:{backgroundColor:'#f2eee3',borderRadius:22,padding:20,gap:6,borderWidth:1,borderColor:'#e4dcc8'},
  businessPromiseEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#755b22'},
  businessPromiseTitle:{fontSize:23,lineHeight:27,fontWeight:'900',color:'#3e341f'},
  businessPromiseBody:{fontSize:13,lineHeight:20,color:'#6c6047',maxWidth:820},
  trustPrinciples:{gap:16,paddingVertical:5},
  signalCardGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  signalCard:{flexGrow:1,flexBasis:300,minWidth:250,backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe5de',borderRadius:18,padding:16},
  signalCardTitle:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  signalCardBody:{fontSize:13,lineHeight:20,color:'#52675a',fontWeight:'700',marginTop:5},
  trustLifecycle:{backgroundColor:'#102218',borderRadius:28,padding:24,gap:13},
  lifecycleGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},
  lifecycleItem:{flexGrow:1,flexBasis:220,minWidth:200,backgroundColor:'#173629',borderRadius:16,padding:14,borderWidth:1,borderColor:'#2d4e3c'},
  lifecycleNum:{fontSize:9,fontWeight:'900',color:'#90b19d'},
  lifecycleTitle:{fontSize:12,fontWeight:'900',letterSpacing:.8,color:'#fff',marginTop:5},
  lifecycleBody:{fontSize:11,lineHeight:17,color:'#bfd0c5',marginTop:5},
  footer:{width:'100%',maxWidth:1240,alignSelf:'center',borderTopWidth:1,borderTopColor:'#d6e1da',paddingHorizontal:18,paddingVertical:24,flexDirection:'row',justifyContent:'space-between',gap:16,flexWrap:'wrap'},
  footerBrand:{fontSize:12,fontWeight:'900',letterSpacing:2,color:palette.green},
  footerCopy:{fontSize:10,color:'#728078',marginTop:3,fontWeight:'700'},
  footerLinks:{flexDirection:'row',gap:15,flexWrap:'wrap',alignItems:'center'},
  footerLink:{fontSize:10,fontWeight:'900',color:'#4a6053'},
});
