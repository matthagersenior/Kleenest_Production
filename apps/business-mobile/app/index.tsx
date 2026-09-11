import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { getBusinessTierCapabilities,tierLabel,type BusinessTierCapabilities } from '../domain/businessTiers';
import { getBusinessAnalytics,getBusinessDashboard,getBusinessManagedLocationPortfolio,getBusinessOperations,BUSINESS_PARITY } from '../services/product';
import { currentBusinessId,listBusinessWorkspaceOptions } from '../services/capabilityWorkflows';
import { getBusinessProductAccess,getBusinessServiceEntitlement } from '../services/productAccess';
import { getBusinessOnboardingGate,getBusinessOnboardingState } from '../services/onboarding';

function count(value:any){
 if(Array.isArray(value))return value.length;
 if(value&&typeof value==='object')return Object.keys(value).length;
 return Number(value||0);
}
function n(value:any){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
type Gate=keyof BusinessTierCapabilities|'always';
type Domain={href:string;title:string;body:string;gate:Gate;glyph:string;group:'Operate'|'Grow'|'Understand'|'Admin'};

const domainSpecs:Domain[]=[
 {href:'/locations',title:'Locations',body:'Manage direct locations and see Enterprise portfolio locations.',gate:'coreManagement',glyph:'⌖',group:'Operate'},
 {href:'/operations',title:'Operations command',body:'Resolve remediation, reverification and preventive work from one queue.',gate:'trustOperations',glyph:'✓',group:'Operate'},
 {href:'/trust-operations',title:'Trust operations',body:'Work evidence, SLA, proof and reverification cases.',gate:'trustOperations',glyph:'◎',group:'Operate'},
 {href:'/prevention',title:'Preventive operations',body:'Prevent recurring restroom issues and hand work to Fleet.',gate:'preventiveOperations',glyph:'↻',group:'Operate'},
 {href:'/live-network',title:'Live Network',body:'Geofences, operational coverage and audience updates.',gate:'communications',glyph:'◉',group:'Operate'},
 {href:'/engagement',title:'Growth & engagement',body:'Promotions, campaigns, contests and events.',gate:'advancedEngagement',glyph:'↗',group:'Grow'},
 {href:'/growth',title:'Growth summary',body:'Connect offers, visits, campaigns and repeat engagement outcomes.',gate:'advancedEngagement',glyph:'↑',group:'Grow'},
 {href:'/qr-studio',title:'QR Studio',body:'Create, design, version, activate and attribute QR programs.',gate:'qr',glyph:'▦',group:'Grow'},
 {href:'/reviews',title:'Reviews',body:'Read verified feedback, evidence and publish Business replies.',gate:'reviews',glyph:'★',group:'Grow'},
 {href:'/progression',title:'Progression',body:'See XP, QR and community participation outcomes.',gate:'always',glyph:'◆',group:'Grow'},
 {href:'/analytics',title:'Analytics',body:'Visitors, occupancy, ROI, benchmarks and campaign results.',gate:'reporting',glyph:'▥',group:'Understand'},
 {href:'/intelligence',title:'Advanced Intelligence',body:'Growth, ROI, benchmarks, trust signals and callable actions.',gate:'intelligence',glyph:'✦',group:'Understand'},
 {href:'/governance',title:'Governance & reporting',body:'Reports, schedules, provenance and trust evidence.',gate:'reporting',glyph:'≡',group:'Understand'},
 {href:'/enterprise-locations',title:'Enterprise Locations',body:'Operate direct and network portfolio locations from one view.',gate:'enterpriseLocationFeatures',glyph:'◫',group:'Understand'},
 {href:'/enterprise',title:'Enterprise',body:'Partner networks, portfolio controls and cross-business operations.',gate:'enterpriseNetworks',glyph:'⬡',group:'Understand'},
 {href:'/enterprise-economy',title:'Enterprise Economy',body:'Partner allocations, budgets, benchmarks and ROI.',gate:'enterpriseNetworks',glyph:'◇',group:'Understand'},
 {href:'/partners',title:'Partners',body:'Partner programs and business relationships.',gate:'always',glyph:'∞',group:'Understand'},
 {href:'/profile',title:'Business profile',body:'Identity, contact details and brand used across Kleenest.',gate:'coreManagement',glyph:'●',group:'Admin'},
 {href:'/members',title:'People & roles',body:'Invite staff, change roles and transfer ownership.',gate:'coreManagement',glyph:'⋮',group:'Admin'},
 {href:'/capabilities',title:'Capabilities',body:'Plan, role and entitlement authority plus partner programs.',gate:'always',glyph:'⚙',group:'Admin'},
 {href:'/assistant',title:'Kleenest AI',body:'Grounded operating, growth and messaging assistance.',gate:'always',glyph:'✧',group:'Admin'},
 {href:'/onboarding',title:'Guided setup',body:'Update the operating profile that drives this targeted experience.',gate:'always',glyph:'→',group:'Admin'},
 {href:'/demo',title:'Real-world demo',body:'Walk Growth or Enterprise through seeded evidence and real controls.',gate:'always',glyph:'▷',group:'Admin'},
];

export default function BusinessHome(){
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading Business control center…');

 async function load(){
  setBusy(true);
  try{
   const businessId=await currentBusinessId();
   const spaces:any[]=await listBusinessWorkspaceOptions();
   const workspace=spaces.find(row=>String(row.business_id)===businessId)||spaces[0];
   const[dashboard,operations,analytics,access,entitlement,onboarding,onboardingGate,portfolio]=await Promise.all([
    getBusinessDashboard(businessId),
    getBusinessOperations(businessId),
    getBusinessAnalytics(businessId),
    getBusinessProductAccess(businessId),
    getBusinessServiceEntitlement(businessId).catch(()=>null),
    getBusinessOnboardingState(businessId).catch(()=>({})),
    getBusinessOnboardingGate(businessId).catch(()=>null),
    getBusinessManagedLocationPortfolio(businessId).catch(()=>null),
   ]);
   const caps=getBusinessTierCapabilities(access,entitlement);
   setData({businessId,workspace,dashboard,operations,analytics,access,entitlement,onboarding,onboardingGate,portfolio,caps,tier:tierLabel(access,entitlement)});
   const degraded=Array.isArray(operations.degradedServices)?operations.degradedServices.filter(Boolean):[];
   setMessage(degraded.length?((degraded.length===1?degraded[0]:degraded.join(', '))+' temporarily unavailable. Other Business controls remain active.'):'');
  }catch(e:any){
   setMessage(e?.message||'Business workspace unavailable.');
  }finally{
   setBusy(false);
  }
 }
 useEffect(()=>{void load()},[]);

 const d=data?.dashboard||{};
 const caps:BusinessTierCapabilities|undefined=data?.caps;
 const attention=useMemo(()=>{
  const o=data?.operations||{};
  return count(o.remediation)+count(o.reverification)+count(o.preventive);
 },[data]);

 const allowedDomains=useMemo(()=>domainSpecs.filter(item=>item.gate==='always'||Boolean(caps?.[item.gate])),[caps]);
 const targetedRoutes:string[]=Array.isArray(data?.onboarding?.experience?.targeted_routes)
  ?data.onboarding.experience.targeted_routes.map(String)
  :Array.isArray(data?.onboarding?.preview?.targeted_routes)
   ?data.onboarding.preview.targeted_routes.map(String)
   :[];
 const priorityDomains=useMemo(()=>targetedRoutes.map(route=>allowedDomains.find(item=>item.href===route)).filter(Boolean).slice(0,6) as Domain[],[allowedDomains,targetedRoutes.join('|')]);
 const prioritySet=new Set(priorityDomains.map(item=>item.href));
 const remainingDomains=allowedDomains.filter(item=>!prioritySet.has(item.href));
 const experience=data?.onboarding?.experience||data?.onboarding?.preview?.experience||{};
 const gate=data?.onboardingGate||{};
 const hasDraft=Boolean(data?.onboarding?.business_type||targetedRoutes.length||Object.keys(data?.onboarding?.answers||{}).length);
 const onboardingComplete=Boolean(gate?.completed);
 const onboardingStatus=onboardingComplete?'ONBOARDING COMPLETE':hasDraft?'ONBOARDING IN PROGRESS':'ONBOARDING NOT STARTED';
 const portfolioSummary=data?.portfolio?.summary||{};
 const directLocations=n(portfolioSummary.direct_location_count??(Array.isArray(d.locations)?d.locations.length:0));
 const portfolioLocations=n(portfolioSummary.portfolio_location_count??directLocations);
 const networkLocations=n(portfolioSummary.network_location_count);
 const partnerBusinesses=n(portfolioSummary.partner_business_count);
 const groups=(['Operate','Grow','Understand','Admin'] as const).map(group=>({group,items:remainingDomains.filter(item=>item.group===group)})).filter(row=>row.items.length);

 return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}>
   <View style={s.heroTop}>
    <View style={s.brandMark}><Text style={s.brandMarkText}>K</Text></View>
    <View style={{flex:1}}>
     <Text style={s.eyebrow}>KLEENEST BUSINESS · {String(data?.tier||'STANDARD').toUpperCase()}</Text>
     <Text style={s.title}>{data?.workspace?.business_name||data?.workspace?.name||'Business command center'}</Text>
    </View>
   </View>
   <Text style={s.heroBody}>{experience?.headline||'Run customer trust, growth, locations and operations from one workspace built around how this business actually works.'}</Text>
   <View style={s.heroBadges}>
    <StatusBadge label={onboardingStatus} strong={onboardingComplete}/>
    {networkLocations>0?<StatusBadge label={String(partnerBusinesses)+' NETWORK PARTNER'+(partnerBusinesses===1?'':'S')}/>:null}
   </View>
   <View style={s.heroStats}>
    <HeroStat label="Direct locations" value={directLocations}/>
    <HeroStat label="Portfolio locations" value={portfolioLocations}/>
    <HeroStat label="Needs attention" value={attention}/>
   </View>
   <View style={s.heroActions}>
    <Link href="/locations" asChild><Pressable style={s.primaryAction}><Text style={s.primaryActionText}>Manage locations</Text><Text style={s.primaryActionArrow}>›</Text></Pressable></Link>
    <Link href="/onboarding" asChild><Pressable style={s.secondaryAction}><Text style={s.secondaryActionText}>{onboardingComplete?'Update setup':'Continue setup'}</Text></Pressable></Link>
   </View>
  </View>

  {message?<View style={s.alert}><Text accessibilityLiveRegion="polite" style={s.alertText}>{message}</Text></View>:null}

  <View style={[s.onboardingPanel,onboardingComplete?s.onboardingComplete:hasDraft?s.onboardingProgress:s.onboardingMissing]}>
   <View style={s.panelIcon}><Text style={s.panelIconText}>{onboardingComplete?'✓':hasDraft?'…':'!'}</Text></View>
   <View style={{flex:1,gap:3}}>
    <Text style={s.panelEyebrow}>{onboardingStatus}</Text>
    <Text style={s.panelTitle}>{onboardingComplete?'Your workspace is personalized.':hasDraft?'Your answers are saved. Finish setup to lock in the operating plan.':'Tell Kleenest how this business operates.'}</Text>
    <Text style={s.panelBody}>{hasDraft?'Home priorities now reflect your saved goals, pain points, success measures and team focus.':'Detailed onboarding determines which workflows, metrics, QR actions and operating surfaces appear first.'}</Text>
   </View>
   <Link href="/onboarding" style={s.panelLink}>{onboardingComplete?'Review':'Continue'} →</Link>
  </View>

  <View style={s.portfolioPanel}>
   <View style={s.portfolioHeader}>
    <View style={{flex:1}}>
     <Text style={s.portfolioEyebrow}>LOCATION AUTHORITY</Text>
     <Text style={s.portfolioTitle}>{portfolioLocations} Portfolio locations</Text>
    </View>
    <View style={s.portfolioBadge}><Text style={s.portfolioBadgeText}>{networkLocations>0?'ENTERPRISE NETWORK':'DIRECT'}</Text></View>
   </View>
   <Text style={s.portfolioBody}>{networkLocations>0
    ?String(directLocations)+' direct · '+String(networkLocations)+' network portfolio · '+String(partnerBusinesses)+' partner business'+(partnerBusinesses===1?'':'es')+'. Network locations are visible as portfolio scope and are not mislabeled as directly owned.'
    :String(directLocations)+' direct or claimed location'+(directLocations===1?'':'s')+' currently belong to this Business workspace.'}</Text>
   <View style={s.portfolioActions}>
    <Link href="/locations" style={s.darkLink}>Open locations</Link>
    {caps?.enterpriseLocationFeatures?<Link href="/enterprise-locations" style={s.lightLink}>Portfolio view</Link>:null}
   </View>
  </View>

  <View style={s.metricStrip}>
   <Metric label="Trust quality" value={d.trust?.score??d.trust?.overall_score??'—'} detail="verified customer signal"/>
   <Metric label="Restroom health" value={d.health?.score??d.health?.overall_score??'—'} detail="operational condition"/>
   <Metric label="Parity" value={BUSINESS_PARITY.length} detail="enforced capabilities"/>
  </View>

  {priorityDomains.length?<View style={s.prioritySection}>
   <View style={s.sectionHeader}>
    <View>
     <Text style={s.sectionEyebrow}>YOUR PRIORITIES</Text>
     <Text style={s.sectionTitle}>Start here</Text>
    </View>
    <Text style={s.sectionMeta}>{String(experience.operating_mode||'targeted').replaceAll('_',' ')}</Text>
   </View>
   <Text style={s.sectionCopy}>These actions are elevated from your onboarding goals and current entitlements—not a generic feature list.</Text>
   <View style={s.actionGrid}>{priorityDomains.map(item=><ActionTile key={item.href} item={item} priority/>)}</View>
  </View>:null}

  {caps?.enterpriseLocationFeatures&&!caps?.enterpriseNetworks?<View style={s.notice}>
   <Text style={s.noticeTitle}>Growth multi-location controls are active</Text>
   <Text style={s.panelBody}>Cross-location operating tools are available. Full partner-network and Enterprise Economy authority remains Enterprise-only.</Text>
  </View>:null}

  <View style={s.workspaceHeader}>
   <Text style={s.sectionEyebrow}>BUSINESS WORKSPACE</Text>
   <Text style={s.sectionTitle}>Everything available to this account</Text>
   <Text style={s.sectionCopy}>Organized by the job you are trying to do, with entitlement rules enforced behind every surface.</Text>
  </View>

  {groups.map(({group,items})=><View key={group} style={s.toolGroup}>
   <View style={s.groupHeader}><Text style={s.groupTitle}>{group}</Text><Text style={s.groupCount}>{items.length}</Text></View>
   <View style={s.toolList}>{items.map(item=><ActionTile key={item.href} item={item}/>)}</View>
  </View>)}

  <View style={s.footer}>
   <Link href="/workspaces" style={s.footerLink}>Switch workspace</Link>
   <Link href="/notifications" style={s.footerLink}>Notifications</Link>
   <Link href="/support" style={s.footerLink}>Support</Link>
   <Link href="/account" style={s.footerLink}>Account</Link>
  </View>
 </ScrollView>
}

function StatusBadge({label,strong=false}:{label:string;strong?:boolean}){return <View style={[s.statusBadge,strong&&s.statusBadgeStrong]}><Text style={[s.statusBadgeText,strong&&s.statusBadgeTextStrong]}>{label}</Text></View>}
function HeroStat({label,value}:{label:string;value:any}){return <View style={s.heroStat}><Text style={s.heroStatValue}>{String(value)}</Text><Text style={s.heroStatLabel}>{label}</Text></View>}
function Metric({label,value,detail}:{label:string;value:any;detail:string}){return <View style={s.metric}><Text style={s.metricValue}>{String(value)}</Text><Text style={s.metricLabel}>{label}</Text><Text style={s.metricDetail}>{detail}</Text></View>}
function ActionTile({item,priority=false}:{item:Domain;priority?:boolean}){
 return <Link href={item.href as any} asChild>
  <Pressable accessibilityRole="button" style={[s.actionTile,priority&&s.actionTilePriority]}>
   <View style={s.actionHeader}>
    <View style={[s.actionGlyph,priority&&s.actionGlyphPriority]}><Text style={[s.actionGlyphText,priority&&s.actionGlyphTextPriority]}>{item.glyph}</Text></View>
    <View style={s.actionHeading}>
     <View style={s.actionTitleRow}><Text style={s.actionTitle}>{item.title}</Text>{priority?<Text style={s.priorityTag}>PRIORITY</Text>:null}</View>
    </View>
   </View>
   <Text style={s.actionBody}>{item.body}</Text>
   <View style={s.actionFooter}>
    <Text style={s.actionGroupLabel}>{item.group.toUpperCase()}</Text>
    <View style={s.actionCta}><Text style={s.actionCtaText}>Open</Text><Text style={s.actionCtaArrow}>→</Text></View>
   </View>
  </Pressable>
 </Link>;
}

const s=StyleSheet.create({
 page:{padding:16,gap:14,backgroundColor:'#f2f5f2',paddingBottom:72},
 hero:{backgroundColor:'#123a2a',padding:20,borderRadius:28,gap:13,shadowColor:'#0b251a',shadowOpacity:.18,shadowRadius:14,shadowOffset:{width:0,height:8},elevation:4},
 heroTop:{flexDirection:'row',alignItems:'center',gap:12},
 brandMark:{width:44,height:44,borderRadius:14,backgroundColor:'#d7ad5b',alignItems:'center',justifyContent:'center'},
 brandMarkText:{fontSize:22,fontWeight:'900',color:'#123a2a'},
 eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.55,color:'#bfe2cf'},
 title:{fontSize:29,lineHeight:34,fontWeight:'900',color:'#fff',marginTop:2},
 heroBody:{fontSize:14,lineHeight:21,color:'#e1ece6'},
 heroBadges:{flexDirection:'row',flexWrap:'wrap',gap:7},
 statusBadge:{borderWidth:1,borderColor:'#527663',backgroundColor:'#234b39',paddingHorizontal:9,paddingVertical:6,borderRadius:999},
 statusBadgeStrong:{backgroundColor:'#d7ad5b',borderColor:'#d7ad5b'},
 statusBadgeText:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:'#d9e9e0'},
 statusBadgeTextStrong:{color:'#123a2a'},
 heroStats:{flexDirection:'row',gap:8},
 heroStat:{flex:1,backgroundColor:'#1d4935',borderRadius:15,padding:11,minHeight:72,justifyContent:'center'},
 heroStatValue:{fontSize:22,fontWeight:'900',color:'#fff'},
 heroStatLabel:{fontSize:10,lineHeight:14,fontWeight:'800',color:'#bfe2cf',marginTop:2},
 heroActions:{flexDirection:'row',gap:8,flexWrap:'wrap'},
 primaryAction:{backgroundColor:'#fff',borderRadius:14,paddingHorizontal:14,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:10},
 primaryActionText:{fontWeight:'900',color:'#123a2a'},
 primaryActionArrow:{fontSize:20,fontWeight:'900',color:'#123a2a'},
 secondaryAction:{borderWidth:1,borderColor:'#6c8b7a',borderRadius:14,paddingHorizontal:14,paddingVertical:11},
 secondaryActionText:{fontWeight:'900',color:'#fff'},
 alert:{backgroundColor:'#fff1df',borderRadius:14,padding:12,borderWidth:1,borderColor:'#ead2ab'},
 alertText:{fontSize:12,fontWeight:'800',color:'#765129'},
 onboardingPanel:{borderRadius:20,padding:15,borderWidth:1,flexDirection:'row',alignItems:'center',gap:11},
 onboardingComplete:{backgroundColor:'#e7f3eb',borderColor:'#c2dccb'},
 onboardingProgress:{backgroundColor:'#fff6df',borderColor:'#ead8a9'},
 onboardingMissing:{backgroundColor:'#fff',borderColor:'#d9e2dc'},
 panelIcon:{width:38,height:38,borderRadius:13,backgroundColor:'#123a2a',alignItems:'center',justifyContent:'center'},
 panelIconText:{color:'#fff',fontSize:18,fontWeight:'900'},
 panelEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#5e7166'},
 panelTitle:{fontSize:15,lineHeight:19,fontWeight:'900',color:'#173528'},
 panelBody:{fontSize:12,lineHeight:18,color:'#65756b'},
 panelLink:{fontSize:11,fontWeight:'900',color:'#123a2a',paddingLeft:4},
 portfolioPanel:{backgroundColor:'#182c23',borderRadius:22,padding:16,gap:8},
 portfolioHeader:{flexDirection:'row',alignItems:'center',gap:10},
 portfolioEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#adc9ba'},
 portfolioTitle:{fontSize:23,fontWeight:'900',color:'#fff',marginTop:2},
 portfolioBadge:{backgroundColor:'#d7ad5b',borderRadius:999,paddingHorizontal:9,paddingVertical:6},
 portfolioBadgeText:{fontSize:9,fontWeight:'900',color:'#182c23'},
 portfolioBody:{fontSize:12,lineHeight:18,color:'#d5e3dc'},
 portfolioActions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:2},
 darkLink:{backgroundColor:'#d7ad5b',color:'#182c23',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999},
 lightLink:{backgroundColor:'#f3f7f4',color:'#173528',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999},
 metricStrip:{flexDirection:'row',flexWrap:'wrap',gap:8},

 metric:{flexGrow:1,flexBasis:150,minWidth:0,backgroundColor:'#fff',borderRadius:18,padding:14,borderWidth:1,borderColor:'#dde5df'},

 metricValue:{fontSize:21,fontWeight:'900',color:'#123a2a'},
 metricLabel:{fontSize:11,fontWeight:'900',color:'#284d3a',marginTop:2},
 metricDetail:{fontSize:9,lineHeight:13,color:'#7a8980',marginTop:2},
 prioritySection:{backgroundColor:'#edf5ef',borderRadius:22,padding:14,gap:10,borderWidth:1,borderColor:'#cfe0d4'},
 sectionHeader:{gap:5,alignItems:'stretch'},

 sectionEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#66786e'},
 sectionTitle:{fontSize:22,lineHeight:27,fontWeight:'900',color:'#102218'},
 sectionMeta:{alignSelf:'flex-start',fontSize:9,fontWeight:'900',textTransform:'uppercase',letterSpacing:.6,color:'#355846',backgroundColor:'#dbe9df',paddingHorizontal:8,paddingVertical:5,borderRadius:999},

 sectionCopy:{fontSize:12,lineHeight:18,color:'#69786f'},
 actionGrid:{gap:8},
 actionTile:{backgroundColor:'#fff',borderRadius:20,padding:15,borderWidth:1,borderColor:'#dce5df',gap:10,alignItems:'stretch',minWidth:0,overflow:'hidden',shadowColor:'#173528',shadowOpacity:.05,shadowRadius:7,shadowOffset:{width:0,height:3},elevation:1},

 actionTilePriority:{borderColor:'#afccb9',backgroundColor:'#fbfdfb'},
 actionHeader:{flexDirection:'row',alignItems:'flex-start',gap:11,minWidth:0},
 actionGlyph:{width:42,height:42,borderRadius:13,backgroundColor:'#edf3ef',alignItems:'center',justifyContent:'center',flexShrink:0},

 actionGlyphPriority:{backgroundColor:'#123a2a'},
 actionGlyphText:{fontSize:18,fontWeight:'900',color:'#315641'},
 actionGlyphTextPriority:{color:'#d7ad5b'},
 actionHeading:{flex:1,minWidth:0,gap:3},

 actionTitleRow:{flexDirection:'row',alignItems:'flex-start',gap:7,flexWrap:'wrap',minWidth:0},

 actionTitle:{fontSize:17,lineHeight:22,fontWeight:'900',color:'#132d20',flexShrink:1,minWidth:0},

 priorityTag:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#725a25',backgroundColor:'#f8e9bd',paddingHorizontal:6,paddingVertical:3,borderRadius:999},
 actionBody:{fontSize:13,lineHeight:19,color:'#617168',minWidth:0},

 actionFooter:{marginTop:2,paddingTop:10,borderTopWidth:1,borderTopColor:'#edf1ee',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,minWidth:0},
 actionGroupLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#708078',flexShrink:1},
 actionCta:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#173f2d',paddingHorizontal:11,paddingVertical:8,borderRadius:999,flexShrink:0},
 actionCtaText:{fontSize:11,fontWeight:'900',color:'#fff'},
 actionCtaArrow:{fontSize:14,fontWeight:'900',color:'#d7ad5b'},

 notice:{backgroundColor:'#e9f2ec',borderRadius:17,padding:14,gap:4,borderWidth:1,borderColor:'#cddfd3'},
 noticeTitle:{fontSize:16,fontWeight:'900',color:'#173f2d'},
 workspaceHeader:{gap:3,marginTop:3},
 toolGroup:{gap:9,backgroundColor:'#f8faf8',borderRadius:20,padding:10,borderWidth:1,borderColor:'#e1e8e3'},

 groupHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4,paddingTop:2},

 groupTitle:{fontSize:17,lineHeight:22,fontWeight:'900',color:'#1a3528'},

 groupCount:{fontSize:10,fontWeight:'900',color:'#65766c',backgroundColor:'#e7ede9',paddingHorizontal:8,paddingVertical:4,borderRadius:999},
 toolList:{gap:9},

 footer:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},
 footerLink:{backgroundColor:'#e8eeea',color:'#173f2d',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999},
});
