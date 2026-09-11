import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { getBusinessTierCapabilities,tierLabel,type BusinessTierCapabilities } from '../domain/businessTiers';
import { getBusinessAnalytics,getBusinessDashboard,getBusinessOperations,BUSINESS_PARITY } from '../services/product';
import { currentBusinessId,listBusinessWorkspaceOptions } from '../services/capabilityWorkflows';
import { getBusinessProductAccess,getBusinessServiceEntitlement } from '../services/productAccess';
import { getBusinessOnboardingState } from '../services/onboarding';

function count(value:any){if(Array.isArray(value))return value.length;if(value&&typeof value==='object')return Object.keys(value).length;return Number(value||0)}
type Gate=keyof BusinessTierCapabilities|'always';
type Domain=[string,string,string,Gate];
const domainSpecs:Domain[]=[
 ['/profile','Business profile','Identity, contact details and brand used across Kleenest.','coreManagement'],
 ['/locations','Locations','Claim, create, edit and deactivate canonical locations.','coreManagement'],
 ['/members','People & roles','Invite staff, change roles and transfer ownership.','coreManagement'],
 ['/engagement','Growth & engagement','Create, edit and delete promotions, campaigns, contests and events.','advancedEngagement'],
 ['/growth','Growth summary','Connect offers, visits, campaigns, contests and engagement outcomes.','advancedEngagement'],
 ['/reviews','Reviews','Read customer feedback, evidence and publish Business replies.','reviews'],
 ['/qr-studio','QR Studio','Create, design, version, activate, share and attribute QR programs.','qr'],
 ['/live-network','Live Network','Geofences, operational coverage and audience updates.','communications'],
 ['/progression','Progression','See XP, QR and community participation outcomes.','always'],
 ['/intelligence','Advanced Intelligence','Growth, ROI, benchmarks, trust signals and callable actions.','intelligence'],
 ['/assistant','Kleenest AI','Grounded growth and messaging assistance.','always'],
 ['/operations','Operations command','Unified remediation, reverification and preventive work queue.','trustOperations'],
 ['/trust-operations','Reverification & remediation','Deep trust operations, proof, SLA and reverification controls.','trustOperations'],
 ['/prevention','Preventive operations','Prevent recurring restroom issues and hand work to Fleet when appropriate.','preventiveOperations'],
 ['/analytics','Analytics','Visitors, occupancy, ROI, benchmarks and campaign results.','reporting'],
 ['/governance','Governance & reporting','Run and export reports, schedules, provenance and trust evidence.','reporting'],
 ['/capabilities','Capabilities','Plan, role and entitlement authority plus partner programs.','always'],
 ['/enterprise-locations','Enterprise Location','Growth multi-location operations across canonical locations without requiring full Enterprise network authority.','enterpriseLocationFeatures'],
 ['/enterprise','Enterprise','Partner networks, portfolio Fleet operations and enterprise-scale controls.','enterpriseNetworks'],
 ['/enterprise-economy','Enterprise Economy','Partner allocations, budgets, activation, benchmarks and ROI.','enterpriseNetworks'],
 ['/partners','Partners','Partner programs and business relationships.','always'],
 ['/onboarding','Guided setup','Update the operating profile that drives this targeted Business experience.','always'],
 ['/demo','Real-world demo','Walk Growth or Enterprise through seeded evidence and the same controls used by real operators.','always'],
];

export default function BusinessHome(){
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading Business control center…');
 async function load(){
  setBusy(true);
  try{
   const businessId=await currentBusinessId(),spaces:any[]=await listBusinessWorkspaceOptions(),workspace=spaces.find(row=>String(row.business_id)===businessId)||spaces[0];
   const[dashboard,operations,analytics,access,entitlement,onboarding]=await Promise.all([
    getBusinessDashboard(businessId),getBusinessOperations(businessId),getBusinessAnalytics(businessId),
    getBusinessProductAccess(businessId),getBusinessServiceEntitlement(businessId).catch(()=>null),getBusinessOnboardingState(businessId).catch(()=>({}))
   ]);
   const caps=getBusinessTierCapabilities(access,entitlement);
   setData({businessId,workspace,dashboard,operations,analytics,access,entitlement,onboarding,caps,tier:tierLabel(access,entitlement)});
   setMessage(operations.partial?'Some operational services are degraded; available controls remain active.':'');
  }catch(e:any){setMessage(e?.message||'Business workspace unavailable.')}finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);

 const d=data?.dashboard||{},locations=Array.isArray(d.locations)?d.locations:[],caps:BusinessTierCapabilities|undefined=data?.caps;
 const attention=useMemo(()=>{const o=data?.operations||{};return count(o.remediation)+count(o.reverification)+count(o.preventive)},[data]);
 const allowedDomains=useMemo(()=>domainSpecs.filter(([, , ,gate])=>gate==='always'||Boolean(caps?.[gate])),[caps]);
 const targeted_routes:string[]=Array.isArray(data?.onboarding?.experience?.targeted_routes)?data.onboarding.experience.targeted_routes.map(String):[];
 const priorityDomains=useMemo(()=>targeted_routes.map(route=>allowedDomains.find(([href])=>href===route)).filter(Boolean).slice(0,6) as Domain[],[allowedDomains,targeted_routes.join('|')]);
 const prioritySet=new Set(priorityDomains.map(([href])=>href));
 const remainingDomains=allowedDomains.filter(([href])=>!prioritySet.has(href));
 const experience=data?.onboarding?.experience||{};
 const hasTargetedExperience=Boolean(data?.onboarding?.completed_at&&targeted_routes.length);

 return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.eyebrow}>BUSINESS CONTROL CENTER · {String(data?.tier||'STANDARD').toUpperCase()}</Text><Text style={s.title}>{data?.workspace?.business_name||data?.workspace?.name||'Kleenest Business'}</Text><Text style={s.heroBody}>{experience?.headline||'Everything this organization is entitled to operate—from canonical locations and customer trust to Growth multi-location operations, Fleet handoff and Enterprise networks—starts here.'}</Text><View style={s.heroLinks}><Link href="/onboarding" style={s.heroLink}>Update setup</Link><Link href="/demo" style={s.heroLink}>Guided demo</Link><Link href="/workspaces" style={s.heroLink}>Switch workspace</Link><Link href="/notifications" style={s.heroLink}>Notifications</Link></View></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <View style={s.metrics}><Metric label="Managed locations" value={locations.length}/><Metric label="Needs attention" value={attention}/><Metric label="Trust quality" value={d.trust?.score??d.trust?.overall_score??'—'}/><Metric label="Health" value={d.health?.score??d.health?.overall_score??'—'}/></View>

  {hasTargetedExperience?<View style={s.priorityWrap}><View style={s.sectionHead}><View><Text style={s.kicker}>YOUR PRIORITIES</Text><Text style={s.sectionTitle}>Built from onboarding</Text></View><Text style={s.meta}>{String(experience.operating_mode||'targeted').replaceAll('_',' ')}</Text></View><Text style={s.meta}>Kleenest is prioritizing these workflows from your goals, pain points, customers, access model, success metrics and team focus. Entitlements still control what can actually be used.</Text><View style={s.grid}>{priorityDomains.map(([href,title,body])=><Link key={href} href={href as any} style={[s.domain,s.priorityDomain]}><Text style={s.priorityLabel}>PRIORITY</Text><Text style={s.domainTitle}>{title}</Text><Text style={s.domainBody}>{body}</Text><Text style={s.open}>Open →</Text></Link>)}</View></View>:<View style={s.setupNote}><Text style={s.tierNoteTitle}>Make this Business workspace targeted</Text><Text style={s.meta}>Complete guided onboarding to prioritize the tools, metrics, QR actions and operating workflows that match this business.</Text><Link href="/onboarding" style={s.inlineLink}>Complete setup →</Link></View>}

  {caps?.enterpriseLocationFeatures&&!caps?.enterpriseNetworks?<View style={s.tierNote}><Text style={s.tierNoteTitle}>Growth multi-location operations enabled</Text><Text style={s.meta}>Enterprise Location features are available on this workspace. Full partner-network and Enterprise Economy controls remain Enterprise-only.</Text></View>:null}

  <View style={s.sectionHead}><View><Text style={s.kicker}>ALL AVAILABLE TOOLS</Text><Text style={s.sectionTitle}>Business workspace</Text></View><Text style={s.meta}>{BUSINESS_PARITY.length} enforced capabilities</Text></View>
  <View style={s.grid}>{remainingDomains.map(([href,title,body])=><Link key={href} href={href as any} style={s.domain}><Text style={s.domainTitle}>{title}</Text><Text style={s.domainBody}>{body}</Text><Text style={s.open}>Open →</Text></Link>)}</View>
  <View style={s.footer}><Link href="/support" style={s.footerLink}>Support</Link><Link href="/terms" style={s.footerLink}>Terms</Link><Link href="/privacy" style={s.footerLink}>Privacy</Link><Link href="/account" style={s.footerLink}>Account</Link></View>
 </ScrollView>
}
function Metric({label,value}:{label:string;value:any}){return <View style={s.metric}><Text style={s.metricValue}>{String(value)}</Text><Text style={s.meta}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:14,backgroundColor:'#f3f6f4',paddingBottom:70},hero:{backgroundColor:'#173f2d',padding:20,borderRadius:26,gap:8},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:'#bde4cf'},title:{fontSize:31,lineHeight:35,fontWeight:'900',color:'#fff'},heroBody:{fontSize:14,lineHeight:21,color:'#dce9e1'},heroLinks:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:3},heroLink:{backgroundColor:'#fff',color:'#173f2d',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999},message:{fontWeight:'700',color:'#596b61'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#fff',padding:14,borderRadius:17,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:23,fontWeight:'900',color:'#173f2d'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},priorityWrap:{backgroundColor:'#eaf4ed',borderRadius:20,padding:14,gap:10,borderWidth:1,borderColor:'#cfe1d5'},priorityDomain:{borderColor:'#b9d3c1',borderWidth:2},priorityLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#557060',marginBottom:3},setupNote:{backgroundColor:'#fff3ce',borderRadius:17,padding:14,gap:5,borderWidth:1,borderColor:'#e7d291'},inlineLink:{fontWeight:'900',color:'#173f2d',paddingTop:5},tierNote:{backgroundColor:'#eaf4ed',borderRadius:17,padding:14,gap:4,borderWidth:1,borderColor:'#cfe1d5'},tierNoteTitle:{fontSize:16,fontWeight:'900',color:'#173f2d'},sectionHead:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:10},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.3,color:'#65756b'},sectionTitle:{fontSize:22,fontWeight:'900',color:'#102218'},grid:{gap:9},domain:{backgroundColor:'#fff',borderRadius:18,padding:15,borderWidth:1,borderColor:'#dbe5de'},domainTitle:{fontSize:17,fontWeight:'900',color:'#102218',marginBottom:4},domainBody:{fontSize:12,lineHeight:18,color:'#65756b'},open:{fontSize:12,fontWeight:'900',color:'#173f2d',marginTop:8},footer:{flexDirection:'row',flexWrap:'wrap',gap:8},footerLink:{backgroundColor:'#edf3ef',color:'#173f2d',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999}});
