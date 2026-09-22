import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { getBusinessSponsorshipSnapshot,saveBusinessSponsoredCampaign,withdrawBusinessSponsoredCampaign,type BusinessSponsoredCampaign,type SponsoredPlacement } from '../services/advertising';
import { useBusinessTheme } from '../services/theme';

const csv=(value:string)=>value.split(',').map(v=>v.trim()).filter(Boolean);
const human=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

export default function Advertising(){
 const theme=useBusinessTheme();
 const[businessId,setBusinessId]=useState(''),[placements,setPlacements]=useState<SponsoredPlacement[]>([]),[campaigns,setCampaigns]=useState<BusinessSponsoredCampaign[]>([]);
 const[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading advertising workspace…');
 const[editingId,setEditingId]=useState<string|null>(null),[name,setName]=useState(''),[headline,setHeadline]=useState(''),[body,setBody]=useState(''),[cta,setCta]=useState('Learn more'),[url,setUrl]=useState('');
 const[region,setRegion]=useState(''),[routeContext,setRouteContext]=useState(''),[amenities,setAmenities]=useState(''),[timeBucket,setTimeBucket]=useState(''),[interests,setInterests]=useState('');
 const[selected,setSelected]=useState<string[]>([]);

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentBusinessId();setBusinessId(id);
   const data=await getBusinessSponsorshipSnapshot(id);setPlacements(data.placements);setCampaigns(data.campaigns);setMessage('');
  }catch(e:any){setMessage(e?.message||'Advertising workspace unavailable.')}finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);

 function reset(){setEditingId(null);setName('');setHeadline('');setBody('');setCta('Learn more');setUrl('');setRegion('');setRouteContext('');setAmenities('');setTimeBucket('');setInterests('');setSelected([])}
 function edit(row:BusinessSponsoredCampaign){
  setEditingId(row.id);setName(row.name||'');setHeadline(row.headline||'');setBody(row.body||'');setCta(row.cta_label||'Learn more');setUrl(row.destination_url||'');
  const t=row.targeting||{};setRegion(String(t.coarse_region||''));setRouteContext(String(t.route_context||''));setAmenities(Array.isArray(t.amenities)?t.amenities.join(', '):'');setTimeBucket(String(t.time_bucket||''));setInterests(Array.isArray(t.broad_interests)?t.broad_interests.join(', '):'');
  setSelected(Array.isArray(row.placements)?row.placements:[]);
 }
 function toggle(code:string){setSelected(current=>current.includes(code)?current.filter(x=>x!==code):[...current,code])}
 const targeting=useMemo(()=>{const t:Record<string,unknown>={};if(region.trim())t.coarse_region=region.trim();if(routeContext.trim())t.route_context=routeContext.trim();if(csv(amenities).length)t.amenities=csv(amenities);if(timeBucket.trim())t.time_bucket=timeBucket.trim();if(csv(interests).length)t.broad_interests=csv(interests);return t},[region,routeContext,amenities,timeBucket,interests]);

 async function save(submit:boolean){
  if(!name.trim()||!headline.trim()||!url.trim()||!selected.length){setMessage('Campaign name, headline, destination URL and at least one placement are required.');return}
  setBusy(true);
  try{
   await saveBusinessSponsoredCampaign(businessId,{id:editingId,name:name.trim(),headline:headline.trim(),body:body.trim(),ctaLabel:cta.trim()||'Learn more',destinationUrl:url.trim(),targeting,placementCodes:selected,submit});
   setMessage(submit?'Campaign submitted to Kleenest for activation.':'Campaign draft saved.');reset();await load();
  }catch(e:any){setMessage(e?.message||'Campaign could not be saved.')}finally{setBusy(false)}
 }
 async function withdraw(id:string){setBusy(true);try{await withdrawBusinessSponsoredCampaign(businessId,id);setMessage('Campaign withdrawn.');await load()}catch(e:any){setMessage(e?.message||'Campaign could not be withdrawn.')}finally{setBusy(false)}}

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page,{backgroundColor:theme.canvas}]}>
  <View style={[s.hero,{backgroundColor:theme.resolved==='dark'?theme.surfaceRaised:'#173f2d',borderColor:theme.line}]}>
   <Text style={s.eyebrow}>KLEENEST BUSINESS · ADVERTISE</Text><Text style={s.title}>Be useful at the moment a customer needs you.</Text>
   <Text style={s.heroBody}>Create tasteful sponsored recommendations that fit Kleenest workflows. Target context—not sensitive identity. Paid placement never changes trust, freshness, verification or organic ranking.</Text>
  </View>
  {message?<View style={[s.notice,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={{color:theme.ink,fontWeight:'800'}}>{message}</Text></View>:null}

  <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <Text style={[s.cardTitle,{color:theme.ink}]}>{editingId?'Edit sponsored campaign':'Create sponsored campaign'}</Text>
   <Text style={[s.meta,{color:theme.muted}]}>Kleenest Sponsored remains part of the workflow even for people who bought Remove Ads. That purchase removes AdMob/network ads only.</Text>
   <Field label="Campaign name" value={name} onChange={setName} placeholder="Weekend family traveler offer"/>
   <Field label="Headline" value={headline} onChange={setHeadline} placeholder="A clean family restroom is 2 minutes away"/>
   <Field label="Body" value={body} onChange={setBody} placeholder="Useful context, offer or reason to stop"/>
   <Field label="CTA" value={cta} onChange={setCta} placeholder="View location"/>
   <Field label="Destination URL" value={url} onChange={setUrl} placeholder="https://…"/>
   <Text style={[s.sectionLabel,{color:theme.accent}]}>CONTEXTUAL TARGETING</Text>
   <Field label="Area / coarse region" value={region} onChange={setRegion} placeholder="St. Louis metro"/>
   <Field label="Route context" value={routeContext} onChange={setRouteContext} placeholder="nearby, road trip, commuter"/>
   <Field label="Amenities" value={amenities} onChange={setAmenities} placeholder="changing table, accessible, family restroom"/>
   <Field label="Time context" value={timeBucket} onChange={setTimeBucket} placeholder="morning, lunch, evening"/>
   <Field label="Broad interests" value={interests} onChange={setInterests} placeholder="family travel, road trips"/>
   <Text style={[s.sectionLabel,{color:theme.accent}]}>PLACEMENTS</Text>
   <View style={s.wrap}>{placements.map(p=>{const on=selected.includes(p.placement_code);return <Pressable key={p.placement_code} onPress={()=>toggle(p.placement_code)} style={[s.chip,{backgroundColor:on?theme.accent:theme.surfaceRaised,borderColor:on?theme.accent:theme.line}]}><Text style={{color:on?theme.accentText:theme.ink,fontWeight:'900',fontSize:11}}>{human(p.placement_code)}</Text></Pressable>})}</View>
   <Text style={[s.sectionLabel,{color:theme.accent}]}>CONSUMER PREVIEW</Text>
   <View style={[s.preview,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[s.sponsored,{color:theme.muted}]}>SPONSORED · YOUR BUSINESS</Text>
    <Text style={[s.previewTitle,{color:theme.ink}]}>{headline.trim()||'Your useful headline appears here'}</Text>
    <Text style={[s.meta,{color:theme.muted}]}>{body.trim()||'Keep it useful and contextual so the placement feels like part of the Kleenest workflow.'}</Text>
    <View style={[s.previewCta,{borderColor:theme.line}]}><Text style={{fontWeight:'900',color:theme.accent}}>{cta.trim()||'Learn more'} →</Text></View>
    <Text style={[s.disclosure,{color:theme.muted}]}>Paid placement. Sponsorship does not change Kleenest trust, freshness, verification or ranking.</Text>
   </View>
   <View style={s.wrap}><Action label="Save draft" quiet onPress={()=>save(false)} disabled={busy}/><Action label="Submit for activation" onPress={()=>save(true)} disabled={busy}/>{editingId?<Action label="Cancel edit" quiet onPress={reset}/>:null}</View>
  </View>

  <View style={{gap:10}}>
   <Text style={[s.cardTitle,{color:theme.ink}]}>Your sponsored campaigns</Text>
   {campaigns.length?campaigns.map(row=><View key={row.id} style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
    <View style={s.row}><View style={{flex:1}}><Text style={[s.itemTitle,{color:theme.ink}]}>{row.headline}</Text><Text style={[s.meta,{color:theme.muted}]}>{human(row.submission_status||row.status)} · {row.impressions||0} impressions · {row.clicks||0} clicks</Text></View><Text style={[s.status,{color:row.status==='active'?theme.success:theme.accent}]}>{row.status==='active'?'LIVE':String(row.submission_status||row.status).toUpperCase()}</Text></View>
    {row.review_note?<Text style={[s.meta,{color:theme.muted}]}>Kleenest note: {row.review_note}</Text>:null}
    <View style={s.wrap}>{row.status!=='active'&&row.submission_status!=='submitted'?<Action label="Edit" quiet onPress={()=>edit(row)}/>:null}{row.submission_status!=='withdrawn'?<Action label="Withdraw" quiet onPress={()=>withdraw(row.id)} disabled={busy}/>:null}</View>
   </View>):<Text style={[s.meta,{color:theme.muted}]}>No sponsored campaigns yet.</Text>}
  </View>
 </ScrollView>
}

function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){const theme=useBusinessTheme();return <View style={{gap:4}}><Text style={[s.meta,{color:theme.muted}]}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/></View>}
function Action({label,onPress,quiet,disabled}:{label:string;onPress:()=>void;quiet?:boolean;disabled?:boolean}){const theme=useBusinessTheme();return <Pressable disabled={disabled} onPress={onPress} style={[s.action,{backgroundColor:quiet?theme.surfaceRaised:theme.accent,borderColor:quiet?theme.line:theme.accent,opacity:disabled?.55:1}]}><Text style={{fontWeight:'900',color:quiet?theme.accent:theme.accentText}}>{label}</Text></Pressable>}

const s=StyleSheet.create({
 page:{padding:16,gap:16,paddingBottom:80},hero:{borderRadius:22,padding:18,gap:7,borderWidth:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:'#bfe0cd'},title:{fontSize:25,lineHeight:30,fontWeight:'900',color:'#fff'},heroBody:{color:'#dce9e2',lineHeight:20},notice:{borderWidth:1,borderRadius:14,padding:12},card:{borderWidth:1,borderRadius:18,padding:15,gap:10},cardTitle:{fontSize:20,fontWeight:'900'},sectionLabel:{fontSize:10,fontWeight:'900',letterSpacing:1.1,marginTop:4},meta:{fontSize:12,lineHeight:18},input:{borderWidth:1,borderRadius:12,paddingHorizontal:12,paddingVertical:11,fontWeight:'700'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:999,paddingHorizontal:10,paddingVertical:8},preview:{borderWidth:1,borderRadius:17,padding:13,gap:6},sponsored:{fontSize:9,fontWeight:'900',letterSpacing:1.1},previewTitle:{fontSize:17,fontWeight:'900'},previewCta:{alignSelf:'flex-start',borderWidth:1,borderRadius:11,paddingHorizontal:10,paddingVertical:8},disclosure:{fontSize:9,lineHeight:13,fontWeight:'700'},action:{borderWidth:1,borderRadius:999,paddingHorizontal:12,paddingVertical:10},row:{flexDirection:'row',alignItems:'center',gap:10},itemTitle:{fontSize:16,fontWeight:'900'},status:{fontSize:10,fontWeight:'900'}
});
