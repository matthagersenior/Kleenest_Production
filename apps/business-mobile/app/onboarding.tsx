import { Link,router } from 'expo-router';
import { useEffect,useMemo,useState,type Dispatch,type SetStateAction } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { currentBusinessId } from '../services/capabilityWorkflows';
import {
  applyBusinessOnboarding,getBusinessOnboardingCatalog,getBusinessOnboardingGate,getBusinessOnboardingState,
  previewBusinessOnboarding,type OnboardingCatalog,type OnboardingGate,type OnboardingPreview,
} from '../services/onboarding';

const BUSINESS_TYPES=[
 ['restaurant_cafe','Restaurant / cafe'],['retail','Retail'],['fuel_travel','Fuel / travel stop'],['hospitality','Hotel / hospitality'],
 ['healthcare_public','Healthcare / public service'],['logistics_delivery','Logistics / delivery'],['field_service','Field service'],
 ['multi_location_chain','Multi-location / chain'],['venue_entertainment','Venue / entertainment'],['other','Other']
] as const;
const GOALS=[
 ['restroom_trust','Improve restroom trust'],['verified_feedback','Collect verified feedback'],['increase_visits','Increase visits'],
 ['loyalty_repeat','Increase repeat visits'],['promotions_events','Promote offers & events'],['multi_location_consistency','Improve multi-location consistency'],
 ['reduce_downtime','Reduce restroom downtime'],['route_efficiency','Improve route efficiency'],['workforce_wellbeing','Support mobile workers'],
 ['service_verification','Verify field service'],['partner_network','Build partner networks'],['multi_market_roi','Measure multi-market ROI']
] as const;
const CUSTOMER_PROFILES=[['general_public','General public'],['customers_only','Customers only'],['members_guests','Members / guests'],['employees','Employees'],['mobile_workforce','Mobile workforce'],['partners_mixed','Partners / mixed audiences']] as const;
const ACCESS_MODELS=[['public','Open public access'],['customer_only','Customer-only access'],['employee_only','Employee-only'],['restricted','Restricted / controlled'],['mixed','Mixed by location or time']] as const;
const TRAFFIC_PATTERNS=[['steady','Steady daily traffic'],['commuter','Commuter peaks'],['meal_peaks','Meal / service peaks'],['scheduled','Scheduled appointments'],['route_based','Route-based mobile work'],['event_peak','Event / surge traffic'],['seasonal','Seasonal']] as const;
const PAIN_POINTS=[['restroom_complaints','Restroom complaints'],['cleanliness_inconsistency','Inconsistent cleanliness'],['restroom_downtime','Restroom downtime'],['weak_reviews','Weak review volume / quality'],['low_repeat_visits','Low repeat visits'],['low_visit_conversion','Hard to convert discovery into visits'],['route_delays','Route delays / detours'],['workforce_stop_access','Workers struggle to find good stops'],['multi_market_visibility','Poor cross-location visibility']] as const;
const QR_INTENTS=[['check_in','Verified check-ins'],['review','Verified reviews'],['rewards','Rewards / contests'],['offer','Promotions / offers'],['service_proof','Service verification']] as const;
const SUCCESS_METRICS=[['verified_visits','Verified visits'],['review_quality','Review quality'],['repeat_visits','Repeat visits'],['restroom_uptime','Restroom uptime'],['response_time','Issue response time'],['route_efficiency','Route efficiency'],['worker_wellbeing','Worker wellbeing'],['partner_roi','Partner / portfolio ROI']] as const;
const REPORTING=[['live','Live dashboard'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']] as const;
const TEAM_FOCUS=[['owner','Owner / GM'],['operations','Operations'],['facilities','Facilities'],['marketing','Marketing'],['customer_experience','Customer experience'],['dispatch','Dispatch / field ops'],['analytics','Analytics'],['executive','Executive']] as const;

export default function BusinessOnboarding(){
 const[businessId,setBusinessId]=useState(''),[catalog,setCatalog]=useState<OnboardingCatalog|null>(null),[gate,setGate]=useState<OnboardingGate|null>(null);
 const[businessType,setBusinessType]=useState('restaurant_cafe'),[goals,setGoals]=useState<string[]>(['restroom_trust','verified_feedback']);
 const[locations,setLocations]=useState('1'),[workers,setWorkers]=useState('0'),[markets,setMarkets]=useState('1');
 const[customerProfile,setCustomerProfile]=useState('general_public'),[accessModel,setAccessModel]=useState('mixed'),[trafficPattern,setTrafficPattern]=useState('steady');
 const[painPoints,setPainPoints]=useState<string[]>([]),[qrIntent,setQrIntent]=useState<string[]>(['check_in','review']),[successMetrics,setSuccessMetrics]=useState<string[]>(['verified_visits','review_quality']);
 const[reportingCadence,setReportingCadence]=useState('weekly'),[teamFocus,setTeamFocus]=useState<string[]>(['owner','operations']);
 const[preview,setPreview]=useState<OnboardingPreview|null>(null),[applied,setApplied]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading guided setup…');

 const scale=useMemo(()=>({locations:Math.max(0,Number(locations)||0),mobile_workers:Math.max(0,Number(workers)||0),markets:Math.max(0,Number(markets)||0)}),[locations,workers,markets]);
 const answers=useMemo(()=>({
   customer_profile:customerProfile,access_model:accessModel,traffic_pattern:trafficPattern,pain_points:painPoints,
   qr_intent:qrIntent,success_metrics:successMetrics,reporting_cadence:reportingCadence,team_focus:teamFocus,
 }),[customerProfile,accessModel,trafficPattern,painPoints,qrIntent,successMetrics,reportingCadence,teamFocus]);

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentBusinessId();setBusinessId(id);
   const[c,stateRaw,g]=await Promise.all([getBusinessOnboardingCatalog(),getBusinessOnboardingState(id).catch(()=>({})),getBusinessOnboardingGate(id).catch(()=>null)]);
   const state:any=stateRaw||{},saved:any=state.answers||{};
   setCatalog(c);setGate(g);
   if(state.business_type)setBusinessType(String(state.business_type));
   if(Array.isArray(state.goals)&&state.goals.length)setGoals(state.goals.map(String));
   if(state.scale){setLocations(String(state.scale.locations??state.scale.resolved_locations??1));setWorkers(String(state.scale.mobile_workers??0));setMarkets(String(state.scale.markets??1));}
   if(saved.customer_profile)setCustomerProfile(String(saved.customer_profile));
   if(saved.access_model)setAccessModel(String(saved.access_model));
   if(saved.traffic_pattern)setTrafficPattern(String(saved.traffic_pattern));
   if(Array.isArray(saved.pain_points))setPainPoints(saved.pain_points.map(String));
   if(Array.isArray(saved.qr_intent))setQrIntent(saved.qr_intent.map(String));
   if(Array.isArray(saved.success_metrics))setSuccessMetrics(saved.success_metrics.map(String));
   if(saved.reporting_cadence)setReportingCadence(String(saved.reporting_cadence));
   if(Array.isArray(saved.team_focus))setTeamFocus(saved.team_focus.map(String));
   if(state.preview&&Object.keys(state.preview).length)setPreview(state.preview);
   setMessage(g?.required?'This new Business workspace must finish onboarding before normal operating screens unlock.':'');
  }catch(e:any){setMessage(e?.message||'Guided setup is unavailable.')}finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);

 const toggle=(setter:Dispatch<SetStateAction<string[]>>,id:string)=>{setter(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);setApplied(null);setPreview(null)};
 async function recommend(){if(!goals.length){setMessage('Choose at least one result you want Kleenest to produce.');return}setBusy(true);try{setPreview(await previewBusinessOnboarding(businessId,businessType,goals,scale,answers));setApplied(null);setMessage('Recommendation ready. Your answers now shape the operating priorities, starter setup and default Business experience.')}catch(e:any){setMessage(e?.message||'Recommendation could not be built.')}finally{setBusy(false)}}
 async function apply(){if(gate&&!gate.can_complete){setMessage('An owner or admin must complete mandatory onboarding for this workspace.');return}setBusy(true);try{const result=await applyBusinessOnboarding(businessId,businessType,goals,scale,answers);setApplied(result);setPreview(result.preview||preview);setMessage('Business setup completed. Kleenest will now prioritize the workflows tied to your operation and desired results.');setGate(await getBusinessOnboardingGate(businessId));router.replace('/')}catch(e:any){setMessage(e?.message||'Business setup could not be completed.')}finally{setBusy(false)}}
 const typeRows=(catalog?.business_types?.length?catalog.business_types:BUSINESS_TYPES.map(([id,label])=>({id,label,detail:''})));
 const goalRows=(catalog?.goals?.length?catalog.goals:GOALS.map(([id,label])=>({id,label,detail:'',product:'standard'})));

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>{gate?.required?'REQUIRED BUSINESS ONBOARDING':'GUIDED BUSINESS SETUP'}</Text><Text style={s.title}>Build Kleenest around how your business actually operates.</Text><Text style={s.body}>We use your customers, access model, traffic, pain points, goals, QR strategy, success metrics and team structure to create a targeted operating experience—not a generic dashboard.</Text></View>
  {gate?.required?<View style={s.required}><Text style={s.requiredTitle}>Complete this setup to unlock the Business workspace</Text><Text style={s.meta}>New businesses must finish the current onboarding version. Existing businesses can update these answers whenever their operation changes.</Text></View>:null}
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <Section title="1 · Business model" body="Choose the closest operating model. This shapes the language, workflow emphasis and starter configuration."><View style={s.chips}>{typeRows.map((row:any)=><Chip key={row.id} label={row.label} active={businessType===row.id} onPress={()=>{setBusinessType(row.id);setPreview(null)}}/>)}</View></Section>
  <Section title="2 · Who uses your locations?" body="Kleenest should treat a public coffee shop differently from employee facilities or a mobile workforce."><ChoiceGroup rows={CUSTOMER_PROFILES} value={customerProfile} setValue={setCustomerProfile}/><Text style={s.subLabel}>Restroom / amenity access</Text><ChoiceGroup rows={ACCESS_MODELS} value={accessModel} setValue={setAccessModel}/><Text style={s.subLabel}>Traffic pattern</Text><ChoiceGroup rows={TRAFFIC_PATTERNS} value={trafficPattern} setValue={setTrafficPattern}/></Section>
  <Section title="3 · Operating scale" body="Scale determines whether your experience should emphasize one location, multi-location operations, Fleet, or Enterprise."><NumberField label="Locations" value={locations} onChange={setLocations}/><NumberField label="People regularly working on the road" value={workers} onChange={setWorkers}/><NumberField label="Cities / markets" value={markets} onChange={setMarkets}/></Section>
  <Section title="4 · What is difficult today?" body="These pain points help Kleenest surface the right operational tools before secondary features."><MultiChoice rows={PAIN_POINTS} selected={painPoints} toggle={id=>toggle(setPainPoints,id)}/></Section>
  <Section title="5 · What results matter?" body="Choose every outcome you want Kleenest to help produce."><View style={s.goalGrid}>{goalRows.map((row:any)=><Pressable key={row.id} onPress={()=>toggle(setGoals,row.id)} style={[s.goal,goals.includes(row.id)&&s.goalOn]}><Text style={[s.goalTitle,goals.includes(row.id)&&s.goalTitleOn]}>{row.label}</Text><Text style={[s.goalMeta,goals.includes(row.id)&&s.goalMetaOn]}>{row.detail||String(row.product||'')}</Text></Pressable>)}</View></Section>
  <Section title="6 · QR experience" body="Decide what a customer, employee or field worker should accomplish when they scan a Kleenest QR code."><MultiChoice rows={QR_INTENTS} selected={qrIntent} toggle={id=>toggle(setQrIntent,id)}/></Section>
  <Section title="7 · How will you measure success?" body="The Business home and reporting experience will emphasize the measures you select."><MultiChoice rows={SUCCESS_METRICS} selected={successMetrics} toggle={id=>toggle(setSuccessMetrics,id)}/><Text style={s.subLabel}>Reporting cadence</Text><ChoiceGroup rows={REPORTING} value={reportingCadence} setValue={setReportingCadence}/></Section>
  <Section title="8 · Who will operate Kleenest?" body="Choose the teams that need the product most; their workflows move toward the top of the Business experience."><MultiChoice rows={TEAM_FOCUS} selected={teamFocus} toggle={id=>toggle(setTeamFocus,id)}/></Section>

  <Pressable disabled={busy||!goals.length} onPress={recommend} style={[s.primary,(busy||!goals.length)&&s.disabled]}><Text style={s.primaryText}>Build my targeted experience</Text></Pressable>

  {preview?<View style={s.recommend}><Text style={s.kickerDark}>TARGETED EXPERIENCE</Text><Text style={s.recommendTitle}>{String((preview.experience as any)?.headline||'Your Kleenest operating plan')}</Text><Text style={s.meta}>Recommended product mix: {(preview.recommended_products||[]).map(String).join(' + ').toUpperCase()||'STANDARD'} · Current plan: {String(preview.current_plan||'standard').toUpperCase()}</Text>
   <Text style={s.sub}>Prioritized Business surfaces</Text><View style={s.chips}>{((preview.targeted_routes||((preview.experience as any)?.targeted_routes)||[]) as string[]).slice(0,8).map(route=><Pill key={route} label={route.replace('/','').replaceAll('-',' ').toUpperCase()}/>)}</View>
   <Text style={s.sub}>Capabilities</Text>{(preview.capabilities||[]).map((cap:any)=><View key={cap.id} style={s.cap}><View style={{flex:1}}><Text style={s.capTitle}>{cap.label}</Text><Text style={s.meta}>{String(cap.product).toUpperCase()}</Text></View><Pill label={cap.available?'AVAILABLE':'OFFER'}/></View>)}
   <Pressable disabled={busy||Boolean(gate&&!gate.can_complete)} onPress={apply} style={[s.primary,(busy||Boolean(gate&&!gate.can_complete))&&s.disabled]}><Text style={s.primaryText}>Complete business setup</Text></Pressable>
   {gate&&!gate.can_complete?<Text style={s.meta}>An owner or admin must complete this step.</Text>:null}
  </View>:null}

  {applied?<View style={s.done}><Text style={s.recommendTitle}>Setup result</Text><Fact label="Created" value={(applied.created||[]).join(', ')||'No new starter objects were needed'}/><Fact label="Offered" value={(applied.offered||[]).join(', ')||'Nothing additional required'}/></View>:null}
  {!gate?.required?<View style={s.links}><Link href="/demo" style={s.link}>Open guided real-world demo</Link><Link href="/capabilities" style={s.link}>Review capabilities</Link><Link href="/workspaces" style={s.link}>Switch workspace</Link></View>:null}
 </ScrollView>
}
function Section({title,body,children}:{title:string;body:string;children:any}){return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><Text style={s.meta}>{body}</Text>{children}</View>}
function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[s.chip,active&&s.chipOn]}><Text style={[s.chipText,active&&s.chipTextOn]}>{label}</Text></Pressable>}
function ChoiceGroup({rows,value,setValue}:{rows:ReadonlyArray<readonly [string,string]>;value:string;setValue:(v:string)=>void}){return <View style={s.chips}>{rows.map(([id,label])=><Chip key={id} label={label} active={value===id} onPress={()=>setValue(id)}/>)}</View>}
function MultiChoice({rows,selected,toggle}:{rows:readonly(readonly[string,string])[];selected:string[];toggle:(id:string)=>void}){return <View style={s.chips}>{rows.map(([id,label])=><Chip key={id} label={label} active={selected.includes(id)} onPress={()=>toggle(id)}/>)}</View>}
function NumberField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <View style={s.numberRow}><Text style={[s.capTitle,{flex:1}]}>{label}</Text><TextInput keyboardType="number-pad" value={value} onChangeText={onChange} style={s.numberInput}/></View>}
function Pill({label}:{label:string}){return <View style={s.pill}><Text style={s.pillText}>{label}</Text></View>}
function Fact({label,value}:{label:string;value:string}){return <View><Text style={s.kickerDark}>{label}</Text><Text style={s.meta}>{value}</Text></View>}

const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:'#f3f6f4',paddingBottom:70},hero:{backgroundColor:'#173f2d',borderRadius:24,padding:20,gap:7},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},kickerDark:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#587066'},title:{fontSize:28,lineHeight:32,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#deebe4'},message:{fontWeight:'800',color:'#596b61'},required:{backgroundColor:'#fff3ce',borderRadius:16,padding:14,gap:4,borderWidth:1,borderColor:'#e7d291'},requiredTitle:{fontSize:15,fontWeight:'900',color:'#59430b'},section:{backgroundColor:'#fff',borderRadius:18,padding:15,gap:10,borderWidth:1,borderColor:'#dbe5de'},sectionTitle:{fontSize:20,fontWeight:'900',color:'#102218'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},subLabel:{fontSize:11,fontWeight:'900',letterSpacing:.5,color:'#587066',textTransform:'uppercase',marginTop:4},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{backgroundColor:'#edf3ef',paddingHorizontal:11,paddingVertical:9,borderRadius:999,borderWidth:1,borderColor:'#dbe5de'},chipOn:{backgroundColor:'#173f2d',borderColor:'#173f2d'},chipText:{fontSize:11,fontWeight:'900',color:'#31533f'},chipTextOn:{color:'#fff'},goalGrid:{gap:7},goal:{backgroundColor:'#f5f8f6',borderRadius:14,padding:12,borderWidth:1,borderColor:'#dbe5de'},goalOn:{backgroundColor:'#173f2d',borderColor:'#173f2d'},goalTitle:{fontSize:14,fontWeight:'900',color:'#183226'},goalTitleOn:{color:'#fff'},goalMeta:{fontSize:11,lineHeight:16,color:'#6a7a70',marginTop:3},goalMetaOn:{color:'#d9e9df'},numberRow:{flexDirection:'row',alignItems:'center',gap:10},numberInput:{width:76,borderWidth:1,borderColor:'#cbd9d0',borderRadius:11,padding:9,textAlign:'center',backgroundColor:'#fafcfb'},primary:{backgroundColor:'#173f2d',padding:14,borderRadius:14,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.45},recommend:{backgroundColor:'#fff',borderRadius:20,padding:16,gap:9,borderWidth:2,borderColor:'#173f2d'},recommendTitle:{fontSize:21,fontWeight:'900',color:'#102218'},sub:{fontSize:16,fontWeight:'900',color:'#102218',marginTop:4},cap:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:6,borderTopWidth:1,borderTopColor:'#edf1ee'},capTitle:{fontSize:13,fontWeight:'900',color:'#20382a'},pill:{backgroundColor:'#e9f2ec',borderRadius:999,paddingHorizontal:8,paddingVertical:5},pillText:{fontSize:9,fontWeight:'900',color:'#31533f'},done:{backgroundColor:'#eaf4ed',borderRadius:18,padding:15,gap:8},links:{flexDirection:'row',flexWrap:'wrap',gap:8},link:{backgroundColor:'#edf3ef',color:'#173f2d',fontWeight:'900',paddingHorizontal:11,paddingVertical:9,borderRadius:999}});
