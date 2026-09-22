import { router,useLocalSearchParams } from 'expo-router';
import { useEffect,useMemo,useRef,useState } from 'react';
import { Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { listBusinessWorkspaceOptions,selectBusinessWorkspace } from '../services/capabilityWorkflows';
import { previewBusinessOnboarding } from '../services/onboarding';
import { provisionBusinessWorkspace,searchSelfServiceLocations,type ClaimableLocation } from '../services/provisioning';

const BUSINESS_TYPES=[
 ['restaurant_cafe','Restaurant / cafe'],['retail','Retail'],['fuel_travel','Fuel / travel stop'],['hospitality','Hotel / hospitality'],
 ['healthcare_public','Healthcare / public service'],['logistics_delivery','Logistics / delivery'],['field_service','Field service'],
 ['multi_location_chain','Multi-location / chain'],['venue_entertainment','Venue / entertainment'],['other','Other']
] as const;
const GOALS=[
 ['restroom_trust','Improve restroom trust'],['verified_feedback','Collect verified feedback'],['increase_visits','Increase visits'],
 ['loyalty_repeat','Increase repeat visits'],['promotions_events','Promote offers & events'],['multi_location_consistency','Multi-location consistency'],
 ['reduce_downtime','Reduce restroom downtime'],['route_efficiency','Improve route efficiency'],['workforce_wellbeing','Support mobile workers'],
 ['service_verification','Verify field service'],['partner_network','Build partner networks'],['multi_market_roi','Measure multi-market ROI']
] as const;

type LocationMode='search'|'new'|'skip';

export default function BusinessGetStarted(){
 const params=useLocalSearchParams<{intent?:string}>();
 const intent=Array.isArray(params.intent)?params.intent[0]:String(params.intent||'business');
 const seeded=useRef(false);
 const[existing,setExisting]=useState<any[]>([]);
 const[businessName,setBusinessName]=useState('');
 const[businessType,setBusinessType]=useState('restaurant_cafe');
 const[goals,setGoals]=useState<string[]>(['restroom_trust','verified_feedback']);
 const[locations,setLocations]=useState('1'),[workers,setWorkers]=useState('0'),[markets,setMarkets]=useState('1');
 const[locationMode,setLocationMode]=useState<LocationMode>('search');
 const[query,setQuery]=useState(''),[results,setResults]=useState<ClaimableLocation[]>([]),[selectedLocationId,setSelectedLocationId]=useState('');
 const[newName,setNewName]=useState(''),[address,setAddress]=useState(''),[city,setCity]=useState(''),[state,setState]=useState(''),[postalCode,setPostalCode]=useState('');
 const[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 useEffect(()=>{void listBusinessWorkspaceOptions().then(setExisting).catch(()=>setExisting([]));},[]);
 useEffect(()=>{
  if(seeded.current)return;
  seeded.current=true;
  if(intent==='claim'){
    setBusinessType('other');setGoals(['restroom_trust','verified_feedback']);
  }else if(intent==='fleet'){
    setBusinessType('logistics_delivery');setGoals(['route_efficiency','workforce_wellbeing','service_verification']);setWorkers('25');
  }else if(intent==='enterprise'){
    setBusinessType('multi_location_chain');setGoals(['multi_location_consistency','partner_network','multi_market_roi']);setLocations('6');setMarkets('2');
  }
 },[intent]);

 const scale=useMemo(()=>({locations:Math.max(1,Number(locations)||1),mobile_workers:Math.max(0,Number(workers)||0),markets:Math.max(1,Number(markets)||1)}),[locations,workers,markets]);
 const answers=useMemo(()=>({
  customer_profile:intent==='fleet'?'mobile_workforce':'general_public',
  access_model:'mixed',
  traffic_pattern:intent==='fleet'?'route_based':'steady',
  pain_points:intent==='fleet'?['route_delays','workforce_stop_access']:[],
  qr_intent:intent==='fleet'?['service_proof','check_in']:['check_in','review'],
  success_metrics:intent==='fleet'?['route_efficiency','worker_wellbeing']:['verified_visits','review_quality'],
  reporting_cadence:intent==='fleet'?'live':'weekly',
  team_focus:intent==='fleet'?['dispatch','operations']:['owner','operations'],
 }),[intent]);

 function toggleGoal(id:string){setGoals(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);}
 async function search(override?:string){
  const value=String(override??query).trim();
  if(value.length<2)return setResults([]);
  setBusy(true);setMessage('');
  try{setResults(await searchSelfServiceLocations(value));}
  catch(e:any){setMessage(e?.message||'Location search is unavailable.');}
  finally{setBusy(false);}
 }
 async function continueExisting(row:any){
  setBusy(true);setMessage('');
  try{await selectBusinessWorkspace(String(row.business_id));router.replace((intent==='claim'?'/locations':'/onboarding') as any);}
  catch(e:any){setMessage(e?.message||'Business workspace could not be opened.');}
  finally{setBusy(false);}
 }
 async function create(){
  if(!businessName.trim())return setMessage('Enter the organization or business name.');
  if(intent==='claim'&&locationMode==='search'&&!selectedLocationId)return setMessage('Select the Kleenest location you want to claim, or add the missing location.');
  if(intent==='claim'&&locationMode==='new'&&(!address.trim()||!city.trim()||!state.trim()))return setMessage('Add the street address, city and state so Kleenest can create the canonical location without guessing.');
  if(intent!=='claim'&&!goals.length)return setMessage('Choose at least one result you want Kleenest to produce.');
  if(intent!=='claim'&&locationMode==='new'&&!newName.trim()&&!businessName.trim())return setMessage('Enter a location name.');
  setBusy(true);setMessage('');
  try{
   const provisioned=await provisionBusinessWorkspace({
    businessName:businessName.trim(),
    existingLocationId:locationMode==='search'&&selectedLocationId?selectedLocationId:null,
    newLocation:locationMode==='new'?{name:newName.trim()||businessName.trim(),address:address.trim(),city:city.trim(),state:state.trim(),postalCode:postalCode.trim(),country:'US'}:null,
   });
   await previewBusinessOnboarding(provisioned.businessId,businessType,goals,scale,answers).catch(()=>undefined);
   await selectBusinessWorkspace(provisioned.businessId);
   if(intent==='claim'){router.replace('/verification-center');return;}
   router.replace('/');
  }catch(e:any){setMessage(e?.message||'Business workspace could not be created.');}
  finally{setBusy(false);}
 }

 if(intent==='claim')return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>FREE BUSINESS LOCATION CLAIM</Text><Text style={s.title}>Claim the Kleenest location your customers already see.</Text><Text style={s.body}>Claiming is free. Standard business verification is unchanged. No plan, payment, workforce survey or operating questionnaire is required before you submit the claim.</Text></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  {existing.length?<View style={s.card}><Text style={s.sectionTitle}>Already have a Business workspace?</Text><Text style={s.meta}>Open it and go straight to Locations. Do not create another workspace.</Text>{existing.filter(row=>!row.is_demo_test).map(row=><Pressable key={String(row.business_id)} disabled={busy} onPress={()=>continueExisting(row)} style={s.existing}><View style={{flex:1}}><Text style={s.rowTitle}>{String(row.business_name||row.name||'Business')}</Text><Text style={s.meta}>{String(row.role||'member')} · existing workspace</Text></View><Text style={s.arrow}>OPEN LOCATIONS →</Text></Pressable>)}</View>:null}
  <View style={s.card}><Text style={s.step}>1 · FIND YOUR LOCATION</Text><Text style={s.sectionTitle}>Business or location name</Text><Text style={s.meta}>Enter it once. Kleenest uses the same name to create the pending Business workspace and search the canonical location network.</Text><View style={s.searchRow}><TextInput autoFocus value={businessName} onChangeText={value=>{setBusinessName(value);setQuery(value)}} onSubmitEditing={()=>search(businessName)} placeholder="Business or location name" placeholderTextColor="#7d8a82" style={[s.input,{flex:1}]}/><Pressable disabled={busy||businessName.trim().length<2} onPress={()=>search(businessName)} style={[s.smallAction,(busy||businessName.trim().length<2)&&s.disabled]}><Text style={s.smallActionText}>{busy?'SEARCHING…':'SEARCH'}</Text></Pressable></View></View>
  {results.length?<View style={s.card}><Text style={s.step}>2 · SELECT</Text><Text style={s.sectionTitle}>Which location is yours?</Text>{results.map(row=>{const active=selectedLocationId===row.id;return <Pressable key={row.id} onPress={()=>{setLocationMode('search');setSelectedLocationId(row.id)}} style={[s.location,active&&s.locationOn]}><View style={{flex:1}}><Text style={s.rowTitle}>{row.name}</Text><Text style={s.meta}>{[row.address,row.city,row.state].filter(Boolean).join(', ')||'Address unavailable'}</Text>{row.rating!=null?<Text style={s.meta}>★ {Number(row.rating).toFixed(1)} · {row.review_count??0} reviews</Text>:null}</View><Text style={s.selectText}>{active?'SELECTED':'SELECT'}</Text></Pressable>})}</View>:null}
  <View style={s.card}><Text style={s.step}>3 · NOT LISTED?</Text><Pressable disabled={busy} onPress={()=>{setLocationMode(locationMode==='new'?'search':'new');setNewName(current=>current||businessName)}} style={s.existing}><View style={{flex:1}}><Text style={s.sectionTitle}>Add missing location</Text><Text style={s.meta}>If discovery still cannot find it, add the address here. Kleenest creates an unclaimed canonical location first, then submits the same verification claim.</Text></View><Text style={s.arrow}>{locationMode==='new'?'CANCEL':'ADD →'}</Text></Pressable>{locationMode==='new'?<View style={{gap:8}}><TextInput value={newName} onChangeText={setNewName} placeholder="Location name" placeholderTextColor="#7d8a82" style={s.input}/><TextInput value={address} onChangeText={setAddress} placeholder="Street address" placeholderTextColor="#7d8a82" style={s.input}/><View style={s.two}><TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#7d8a82" style={[s.input,{flex:1}]}/><TextInput value={state} onChangeText={setState} placeholder="State" placeholderTextColor="#7d8a82" style={[s.input,{width:90}]}/></View><TextInput value={postalCode} onChangeText={setPostalCode} placeholder="ZIP / postal code" placeholderTextColor="#7d8a82" style={s.input}/></View>:null}</View>
  <View style={s.final}><Text style={s.sectionTitle}>Verification stays the same</Text><Text style={s.meta}>Submitting creates only the minimum pending Business workspace and the location claim. It does not grant location authority. The existing company-email, DNS, operator-consent or Kleenest-review verification rules still decide approval.</Text><Pressable disabled={busy||!businessName.trim()||(locationMode==='search'?!selectedLocationId:(!address.trim()||!city.trim()||!state.trim()))} onPress={create} style={[s.primary,(busy||!businessName.trim()||(locationMode==='search'?!selectedLocationId:(!address.trim()||!city.trim()||!state.trim())))&&s.disabled]}><Text style={s.primaryText}>{busy?'SUBMITTING…':locationMode==='new'?'Add & claim this location free':'Claim this location for free'}</Text></Pressable></View>
 </ScrollView>;

 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.kicker}>KLEENEST FOR BUSINESS</Text><Text style={s.title}>Set up the organization first. Kleenest will recommend the right operating package.</Text><Text style={s.body}>Create or claim your Business workspace, tell us the scale and outcomes that matter, then continue into the detailed guided setup. Paid access and trust verification stay separate.</Text></View>
  <View style={s.final}><Text style={s.sectionTitle}>Already listed in Kleenest?</Text><Text style={s.meta}>Claim your location free. Verification stays the same, and you do not need to choose a paid plan before requesting authority over the location.</Text><Pressable onPress={()=>router.replace({pathname:'/get-started',params:{intent:'claim'}} as any)} style={s.primary}><Text style={s.primaryText}>Claim your location free</Text></Pressable></View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  {existing.length?<View style={s.card}><Text style={s.sectionTitle}>You already have a Business workspace</Text><Text style={s.meta}>Continue with an existing organization instead of creating a duplicate.</Text>{existing.filter(row=>!row.is_demo_test).map(row=><Pressable key={String(row.business_id)} disabled={busy} onPress={()=>continueExisting(row)} style={s.existing}><View style={{flex:1}}><Text style={s.rowTitle}>{String(row.business_name||row.name||'Business')}</Text><Text style={s.meta}>{String(row.role||'member')} · {String(row.business_tier||'standard')}</Text></View><Text style={s.arrow}>CONTINUE →</Text></Pressable>)}</View>:null}

  <View style={s.card}><Text style={s.step}>1 · ORGANIZATION</Text><Text style={s.sectionTitle}>What are we setting up?</Text><TextInput value={businessName} onChangeText={setBusinessName} placeholder="Business or organization name" placeholderTextColor="#7d8a82" style={s.input}/><View style={s.chips}>{BUSINESS_TYPES.map(([id,label])=><Chip key={id} label={label} active={businessType===id} onPress={()=>setBusinessType(id)}/>)}</View></View>

  <View style={s.card}><Text style={s.step}>2 · OUTCOMES</Text><Text style={s.sectionTitle}>What should Kleenest help improve?</Text><Text style={s.meta}>These answers drive the Standard, Growth, Fleet, Enterprise or Enterprise + Fleet recommendation.</Text><View style={s.chips}>{GOALS.map(([id,label])=><Chip key={id} label={label} active={goals.includes(id)} onPress={()=>toggleGoal(id)}/>)}</View></View>

  <View style={s.card}><Text style={s.step}>3 · SCALE</Text><Text style={s.sectionTitle}>How large is the operation?</Text><NumberField label="Locations" value={locations} onChange={setLocations}/><NumberField label="People regularly working on the road" value={workers} onChange={setWorkers}/><NumberField label="Cities / markets" value={markets} onChange={setMarkets}/></View>

  <View style={s.card}><Text style={s.step}>4 · LOCATION</Text><Text style={s.sectionTitle}>Claim what Kleenest already knows, add your first location, or do this later.</Text><View style={s.modeRow}><Chip label="Find existing" active={locationMode==='search'} onPress={()=>setLocationMode('search')}/><Chip label="Add new" active={locationMode==='new'} onPress={()=>setLocationMode('new')}/><Chip label="Do later" active={locationMode==='skip'} onPress={()=>setLocationMode('skip')}/></View>
   {locationMode==='search'?<><View style={s.searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={()=>search()} placeholder="Name, address or city" placeholderTextColor="#7d8a82" style={[s.input,{flex:1}]}/><Pressable disabled={busy||query.trim().length<2} onPress={()=>search()} style={[s.smallAction,(busy||query.trim().length<2)&&s.disabled]}><Text style={s.smallActionText}>SEARCH</Text></Pressable></View>{results.map(row=>{const active=selectedLocationId===row.id;return <Pressable key={row.id} onPress={()=>setSelectedLocationId(row.id)} style={[s.location,active&&s.locationOn]}><View style={{flex:1}}><Text style={s.rowTitle}>{row.name}</Text><Text style={s.meta}>{[row.address,row.city,row.state].filter(Boolean).join(', ')||'Address unavailable'}</Text></View><Text style={s.selectText}>{active?'SELECTED':'SELECT'}</Text></Pressable>})}</>:null}
   {locationMode==='new'?<View style={{gap:8}}><TextInput value={newName} onChangeText={setNewName} placeholder="Location name" placeholderTextColor="#7d8a82" style={s.input}/><TextInput value={address} onChangeText={setAddress} placeholder="Street address" placeholderTextColor="#7d8a82" style={s.input}/><View style={s.two}><TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#7d8a82" style={[s.input,{flex:1}]}/><TextInput value={state} onChangeText={setState} placeholder="State" placeholderTextColor="#7d8a82" style={[s.input,{width:90}]}/></View><TextInput value={postalCode} onChangeText={setPostalCode} placeholder="ZIP / postal code" placeholderTextColor="#7d8a82" style={s.input}/></View>:null}
  </View>

  <View style={s.final}><Text style={s.sectionTitle}>What happens next</Text><Text style={s.meta}>Kleenest creates a pending workspace with you as owner, submits any existing-location claim for review, saves this onboarding draft, and opens the mandatory guided setup with your recommendation already calculated.</Text><Pressable disabled={busy||!businessName.trim()||!goals.length} onPress={create} style={[s.primary,(busy||!businessName.trim()||!goals.length)&&s.disabled]}><Text style={s.primaryText}>{busy?'SETTING UP…':'CREATE WORKSPACE & CONTINUE'}</Text></Pressable></View>
 </ScrollView>;
}

function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[s.chip,active&&s.chipOn]}><Text style={[s.chipText,active&&s.chipTextOn]}>{label}</Text></Pressable>;}
function NumberField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <View style={s.numberRow}><Text style={s.rowTitle}>{label}</Text><TextInput value={value} onChangeText={onChange} keyboardType="number-pad" style={s.number}/></View>;}

const s=StyleSheet.create({
 page:{padding:18,gap:12,backgroundColor:'#f3f6f4',paddingBottom:70},
 hero:{backgroundColor:'#173f2d',borderRadius:24,padding:20,gap:7},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},title:{fontSize:28,lineHeight:33,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#deebe4'},
 message:{fontWeight:'800',color:'#7d493d'},card:{backgroundColor:'#fff',borderRadius:19,padding:15,gap:10,borderWidth:1,borderColor:'#dbe5de'},step:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#5f7468'},sectionTitle:{fontSize:20,fontWeight:'900',color:'#102218'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},
 input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,paddingHorizontal:12,paddingVertical:11,backgroundColor:'#fafcfb',color:'#132b21'},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},modeRow:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{backgroundColor:'#edf3ef',borderRadius:999,paddingHorizontal:11,paddingVertical:9,borderWidth:1,borderColor:'#dbe5de'},chipOn:{backgroundColor:'#173f2d',borderColor:'#173f2d'},chipText:{fontSize:11,fontWeight:'900',color:'#31533f'},chipTextOn:{color:'#fff'},
 numberRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},number:{width:84,borderWidth:1,borderColor:'#cbd9d0',borderRadius:10,padding:9,textAlign:'center',backgroundColor:'#fafcfb'},rowTitle:{fontSize:14,fontWeight:'900',color:'#173528'},
 searchRow:{flexDirection:'row',gap:8},smallAction:{backgroundColor:'#173f2d',borderRadius:12,paddingHorizontal:14,justifyContent:'center'},smallActionText:{color:'#fff',fontWeight:'900',fontSize:11},location:{borderWidth:1,borderColor:'#dbe5de',borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:10},locationOn:{borderWidth:2,borderColor:'#173f2d',backgroundColor:'#f2f8f4'},selectText:{fontSize:10,fontWeight:'900',color:'#173f2d'},
 two:{flexDirection:'row',gap:8},existing:{borderTopWidth:1,borderTopColor:'#edf1ee',paddingTop:10,flexDirection:'row',alignItems:'center',gap:10},arrow:{fontSize:10,fontWeight:'900',color:'#173f2d'},final:{backgroundColor:'#e8f2eb',borderRadius:20,padding:16,gap:9,borderWidth:1,borderColor:'#cfe0d5'},primary:{backgroundColor:'#173f2d',borderRadius:14,padding:14,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.45},
});
