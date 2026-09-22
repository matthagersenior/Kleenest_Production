import { useEffect,useMemo,useState } from 'react';
import { Image,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { OSHero,OSSwitch,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import { chooseOwnerSponsoredCreative,getOwnerAdMobHealthSnapshot,getOwnerRelevanceSponsorshipSnapshot,updateOwnerHeroPolicy,updateOwnerSponsoredPlacement,uploadOwnerSponsoredCreative,upsertOwnerSponsoredCampaign,type OwnerSponsoredCreativeDraft } from '../services/ownerAdmin';

const human=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const number=(value:any,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const splitCsv=(value:string)=>value.split(',').map(v=>v.trim()).filter(Boolean);
const percent=(value:any,digits=1)=>value===null||value===undefined?'—':String(number(value).toFixed(digits))+'%';
const when=(value:any)=>value?new Date(String(value)).toLocaleString():'No events yet';

export default function RelevanceControl(){
 const theme=usePlatformTheme(),card=useOSCardStyle();
 const[data,setData]=useState<any>({hero_policies:[],placements:[],campaigns:[],rules:{}}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const[adMob,setAdMob]=useState<any>({hours:24,status:'no_data',requests:0,fills:0,fill_rate:null,impressions:0,clicks:0,no_fill:0,load_errors:0,initialized:0,initialization_errors:0,consent_blocked:0,last_event_at:null,placements:[],recent_failures:[]}),[adMobHours,setAdMobHours]=useState(24);
 const[sponsor,setSponsor]=useState(''),[headline,setHeadline]=useState(''),[body,setBody]=useState(''),[url,setUrl]=useState(''),[cta,setCta]=useState('Learn more'),[coarseRegion,setCoarseRegion]=useState(''),[routeContext,setRouteContext]=useState(''),[amenities,setAmenities]=useState(''),[interests,setInterests]=useState(''),[selectedPlacements,setSelectedPlacements]=useState<string[]>([]);
 const[creativeMode,setCreativeMode]=useState<'text_only'|'image_text'|'image_only'>('text_only'),[imageUrl,setImageUrl]=useState(''),[imageAlt,setImageAlt]=useState(''),[logoUrl,setLogoUrl]=useState(''),[pickedImage,setPickedImage]=useState<OwnerSponsoredCreativeDraft|null>(null);
 const placements=Array.isArray(data?.placements)?data.placements:[],policies=Array.isArray(data?.hero_policies)?data.hero_policies:[],campaigns=Array.isArray(data?.campaigns)?data.campaigns:[];
 const availablePlacements=useMemo(()=>placements.filter((row:any)=>row.owner_enabled!==false&&row.active!==false),[placements]);
 const adMobPlacements=Array.isArray(adMob?.placements)?adMob.placements:[],adMobFailures=Array.isArray(adMob?.recent_failures)?adMob.recent_failures:[];
 const adMobStatus=String(adMob?.status||'no_data');
 const adMobTone:'good'|'warning'|'danger'|'neutral'=adMobStatus==='receiving_fills'?'good':adMobStatus==='initialization_error'?'danger':adMobStatus==='no_fill'||adMobStatus==='degraded'?'warning':'neutral';

 async function load(){
  setBusy(true);setMessage('');
  try{
   setData(await getOwnerRelevanceSponsorshipSnapshot());
   try{setAdMob(await getOwnerAdMobHealthSnapshot(adMobHours))}
   catch(error:any){setAdMob((current:any)=>({...current,hours:adMobHours,status:'unavailable'}));setMessage(error?.message||'AdMob health telemetry could not be loaded.')}
  }catch(error:any){setMessage(error?.message||'Relevance controls could not be loaded.')}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[adMobHours]);

 async function mutate(action:()=>Promise<any>,success:string){setBusy(true);setMessage('');try{await action();setMessage(success);await load()}catch(error:any){setMessage(error?.message||'Update failed.')}finally{setBusy(false)}}
 const tuneHero=(row:any,patch:Record<string,unknown>)=>mutate(()=>updateOwnerHeroPolicy(row,patch),'Organic hero policy updated.');
 const tunePlacement=(row:any,patch:Record<string,unknown>)=>mutate(()=>updateOwnerSponsoredPlacement(row,patch),'Sponsored placement updated.');
 function togglePlacement(code:string){setSelectedPlacements(current=>current.includes(code)?current.filter(x=>x!==code):[...current,code])}

 async function createCampaign(status:'draft'|'active'){
  if(!sponsor.trim()||!headline.trim()||!url.trim()||!selectedPlacements.length){setMessage('Sponsor, headline, destination URL and at least one placement are required.');return}
  if(creativeMode!=='text_only'&&!pickedImage&&!imageUrl.trim()){setMessage('Choose an image or enter an HTTPS image URL for this creative mode.');return}
  if((pickedImage||imageUrl.trim())&&!imageAlt.trim()){setMessage('Add image alt text so the sponsored creative is accessible.');return}
  const targeting:Record<string,unknown>={};
  if(coarseRegion.trim())targeting.coarse_region=coarseRegion.trim();
  if(routeContext.trim())targeting.route_context=routeContext.trim();
  if(splitCsv(amenities).length)targeting.amenities=splitCsv(amenities);
  if(splitCsv(interests).length)targeting.broad_interests=splitCsv(interests);
  setBusy(true);setMessage('');
  try{
   const resolvedImage=pickedImage?await uploadOwnerSponsoredCreative(pickedImage):imageUrl.trim()||null;
   await upsertOwnerSponsoredCampaign({name:headline.trim(),sponsorName:sponsor.trim(),headline:headline.trim(),body:body.trim(),ctaLabel:cta.trim()||'Learn more',destinationUrl:url.trim(),status,targeting,frequencyCapDaily:2,placementCodes:selectedPlacements,creativeMode,imageUrl:resolvedImage,imageAlt:resolvedImage?imageAlt.trim():null,logoUrl:logoUrl.trim()||null});
   setMessage(status==='active'?'Sponsored campaign activated.':'Sponsored campaign saved as draft.');
   setSponsor('');setHeadline('');setBody('');setUrl('');setCta('Learn more');setCoarseRegion('');setRouteContext('');setAmenities('');setInterests('');setSelectedPlacements([]);setCreativeMode('text_only');setImageUrl('');setImageAlt('');setLogoUrl('');setPickedImage(null);
   await load();
  }catch(error:any){setMessage(error?.message||'Campaign could not be saved.')}finally{setBusy(false)}
 }

 async function setCampaignStatus(row:any,status:'active'|'paused'|'ended'){
  await mutate(()=>upsertOwnerSponsoredCampaign({
    id:String(row.id),name:String(row.name),sponsorName:String(row.sponsor_name),headline:String(row.headline),body:String(row.body||''),ctaLabel:String(row.cta_label||'Learn more'),destinationUrl:String(row.destination_url),
    targetLocationId:row.target_location_id?String(row.target_location_id):null,status,startsAt:row.starts_at||null,endsAt:row.ends_at||null,targeting:row.targeting||{},frequencyCapDaily:number(row.frequency_cap_daily,2),impressionCapTotal:row.impression_cap_total==null?null:number(row.impression_cap_total),ownerPriority:number(row.owner_priority),placementCodes:Array.isArray(row.placements)?row.placements.map(String):[],creativeMode:row.creative_mode||'text_only',imageUrl:row.image_url||null,imageAlt:row.image_alt||null,logoUrl:row.logo_url||null,
  }),`Campaign ${status}.`);
 }

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={{padding:16,gap:16,paddingBottom:80,backgroundColor:theme.canvas}}>
  <OSHero eyebrow="KLEENESTOS · RELEVANCE + SPONSORSHIP" title="What earns attention" body="Control organic hero relevance and paid inventory separately. Platform-wide behavior is owner-visible and owner-touchable."/>
  {message?<View style={{...card,borderColor:theme.warning}}><Text style={{fontWeight:'900',color:theme.ink}}>{message}</Text></View>:null}

  <View style={{...card,gap:8}}>
   <Text style={{fontWeight:'900',fontSize:18,color:theme.ink}}>Hard product boundaries</Text>
   <Rule ok={data?.rules?.hero_is_organic_only!==false} text="Hero placement is organic Kleenest relevance only."/>
   <Rule ok={data?.rules?.paid_can_change_trust===false} text="Payment cannot change trust, freshness, verification or ranking."/>
   <Rule ok={data?.rules?.sensitive_targeting_allowed===false} text="Sensitive targeting is not allowed."/>
   <Rule ok={data?.rules?.premium_removes_sponsored===false} text="$5 Remove Ads / Premium suppresses AdMob and other network inventory only. Direct Kleenest Sponsored recommendations remain available."/>
  </View>

  <View style={{gap:10}}>
   <SectionHeader title="AdMob Health" body="Live Google network-ad serving telemetry from the Consumer app. This is operational health only; no user, device, location, targeting or content data is stored."/>
   <View style={{...card,gap:10}}>
    <View style={s.row}><View style={{flex:1,gap:3}}><Text style={[s.title,{color:theme.ink}]}>Google Mobile Ads</Text><Text style={[s.meta,{color:theme.muted}]}>{adMobHours}h window · last event {when(adMob?.last_event_at)}</Text></View><StatusPill label={human(adMobStatus)} tone={adMobTone}/></View>
    <View style={s.controlRow}><Control label="24 hours" onPress={()=>setAdMobHours(24)}/><Control label="7 days" onPress={()=>setAdMobHours(168)}/></View>
    <View style={s.metricGrid}>
      <HealthMetric label="SDK initialized" value={number(adMob?.initialized)}/>
      <HealthMetric label="Requests" value={number(adMob?.requests)}/>
      <HealthMetric label="Fills" value={number(adMob?.fills)}/>
      <HealthMetric label="Fill rate" value={percent(adMob?.fill_rate)}/>
      <HealthMetric label="Impressions" value={number(adMob?.impressions)}/>
      <HealthMetric label="Clicks" value={number(adMob?.clicks)}/>
      <HealthMetric label="No-fill" value={number(adMob?.no_fill)}/>
      <HealthMetric label="Load errors" value={number(adMob?.load_errors)}/>
    </View>
    {adMobStatus==='no_data'?<Text style={[s.meta,{color:theme.muted}]}>No AdMob telemetry yet. Open the Consumer app on a network-ad eligible account and visit Explore, Progress or Games to generate a request.</Text>:null}
    {adMobStatus==='initialization_error'?<Text style={[s.warning,{color:theme.danger}]}>Google Mobile Ads has initialization failures and no successful initialization in this window.</Text>:null}
    {adMobStatus==='no_fill'?<Text style={[s.warning,{color:theme.warning}]}>Requests are reaching Google, but Google returned no inventory in this window.</Text>:null}
    {adMobStatus==='receiving_fills'?<Text style={[s.good,{color:theme.success}]}>Google is returning ad fills. Impression and click counts confirm whether rendered ads are being seen and used.</Text>:null}
   </View>

   <View style={{...card,gap:9}}>
    <SectionHeader title="Placement health" body="Requests and outcomes by Consumer surface."/>
    {adMobPlacements.length?adMobPlacements.map((row:any)=><View key={String(row.placement_code)} style={[s.healthRow,{borderColor:theme.line}]}>
      <View style={{flex:1}}><Text style={{fontWeight:'900',color:theme.ink}}>{human(String(row.placement_code))}</Text><Text style={[s.meta,{color:theme.muted}]}>{number(row.requests)} requests · {number(row.fills)} fills · {number(row.impressions)} impressions · {number(row.clicks)} clicks</Text></View>
      <Text style={{fontWeight:'900',color:theme.accent}}>{row.requests?percent(100*number(row.fills)/Math.max(1,number(row.requests))):'—'}</Text>
    </View>):<Text style={[s.meta,{color:theme.muted}]}>No placement requests recorded in this window.</Text>}
   </View>

   <View style={{...card,gap:9}}>
    <SectionHeader title="Recent AdMob failures" body="No-fill is shown separately from SDK/load failures so inventory shortages do not masquerade as broken integration."/>
    {adMobFailures.length?adMobFailures.map((row:any,index:number)=><View key={String(row.created_at||index)+':'+index} style={[s.failure,{borderColor:theme.line}]}>
      <View style={s.row}><Text style={{flex:1,fontWeight:'900',color:row.event_type==='no_fill'?theme.warning:theme.danger}}>{human(String(row.event_type||'error'))}</Text><Text style={[s.meta,{color:theme.muted}]}>{when(row.created_at)}</Text></View>
      <Text style={[s.meta,{color:theme.ink}]}>{human(String(row.placement_code||'sdk'))} · {String(row.platform||'unknown')}</Text>
      {row.error_code?<Text selectable style={[s.meta,{color:theme.muted}]}>{String(row.error_code)}</Text>:null}
      {row.error_message?<Text selectable style={[s.meta,{color:theme.muted}]}>{String(row.error_message)}</Text>:null}
    </View>):<Text style={[s.meta,{color:theme.muted}]}>No AdMob failures recorded in this window.</Text>}
   </View>
  </View>

  <View style={{gap:10}}>
   <SectionHeader title="Organic hero policies" body="Swipeable hero panels can highlight review opportunities, missions, fresh Kleenest places, saved choices, top organic results and progression. No paid kind can be added here."/>
   {policies.map((row:any)=><View key={String(row.surface_code)} style={card}>
    <View style={s.row}><View style={{flex:1}}><Text style={[s.title,{color:theme.ink}]}>{human(String(row.surface_code))}</Text><Text style={[s.meta,{color:theme.muted}]}>{Array.isArray(row.allowed_kinds)?row.allowed_kinds.map(human).join(' · '):''}</Text></View><OSSwitch value={row.active!==false} onValueChange={value=>tuneHero(row,{active:value})}/></View>
    <View style={s.controlRow}>
      <Control label="Cards −" onPress={()=>tuneHero(row,{max_cards:Math.max(1,number(row.max_cards,5)-1)})}/>
      <Text style={[s.value,{color:theme.ink}]}>{row.max_cards} panels</Text>
      <Control label="Cards +" onPress={()=>tuneHero(row,{max_cards:Math.min(8,number(row.max_cards,5)+1)})}/>
    </View>
    <ToggleRow label="Swipe" value={row.swipe_enabled!==false} onChange={value=>tuneHero(row,{swipe_enabled:value})}/>
    <ToggleRow label="Dot indicators" value={row.dot_indicators!==false} onChange={value=>tuneHero(row,{dot_indicators:value})}/>
    <ToggleRow label="Autoplay" value={row.autoplay===true} onChange={value=>tuneHero(row,{autoplay:value})}/>
    {String(row.surface_code)==='consumer_home'?<View style={s.presets}><Text style={[s.meta,{color:theme.muted}]}>Priority presets</Text><View style={s.controlRow}>
      <Control label="Reviews first" onPress={()=>tuneHero(row,{weights:{...row.weights,review_ready:130,active_mission:115,fresh_kleenest:90,top_ranked:75}})}/>
      <Control label="Discovery first" onPress={()=>tuneHero(row,{weights:{...row.weights,fresh_kleenest:125,top_ranked:115,saved_choice:100,review_ready:95}})}/>
      <Control label="Balanced" onPress={()=>tuneHero(row,{weights:{review_ready:100,active_mission:95,fresh_kleenest:88,saved_choice:80,top_ranked:75,next_objective:70,find_bathroom:60,share_knowledge:45,scan_qr:40}})}/>
    </View></View>:null}
   </View>)}
  </View>

  <View style={{gap:10}}>
   <SectionHeader title="Sponsored inventory" body="Paid placements are separate cards below or among content. Hero-named slots are rejected by the database."/>
   {placements.map((row:any)=><View key={String(row.placement_code)} style={card}>
    <View style={s.row}><View style={{flex:1}}><Text style={[s.title,{color:theme.ink}]}>{human(String(row.placement_code))}</Text><Text style={[s.meta,{color:theme.muted}]}>{row.surface} · {row.slot} · {row.format}</Text></View><OSSwitch value={row.owner_enabled!==false&&row.active!==false} onValueChange={value=>tunePlacement(row,{owner_enabled:value,active:value})}/></View>
    <View style={s.controlRow}><Control label="Cap −" onPress={()=>tunePlacement(row,{frequency_cap_daily:Math.max(1,number(row.frequency_cap_daily,3)-1)})}/><Text style={[s.value,{color:theme.ink}]}>{row.frequency_cap_daily}/day</Text><Control label="Cap +" onPress={()=>tunePlacement(row,{frequency_cap_daily:Math.min(20,number(row.frequency_cap_daily,3)+1)})}/></View>
   </View>)}
  </View>

  <View style={{...card,gap:10}}>
   <SectionHeader title="Create sponsored campaign" body="Target only contextual, non-sensitive signals: coarse region, route context, amenities, time bucket or broad interests."/>
   <Field label="Sponsor" value={sponsor} onChange={setSponsor} placeholder="Business or partner"/>
   <Field label="Headline" value={headline} onChange={setHeadline} placeholder="Useful, specific offer"/>
   <Field label="Body" value={body} onChange={setBody} placeholder="Why this is relevant"/>
   <Field label="Destination URL" value={url} onChange={setUrl} placeholder="https://…"/>
   <Text style={[s.sectionLabel,{color:theme.accent}]}>AD CREATIVE</Text>
   <View style={s.chips}>{(['text_only','image_text','image_only'] as const).map(mode=><Pressable key={mode} onPress={()=>setCreativeMode(mode)} style={[s.chip,{backgroundColor:creativeMode===mode?theme.accent:theme.surfaceRaised,borderColor:creativeMode===mode?theme.accent:theme.line}]}><Text style={{fontWeight:'900',fontSize:10,color:creativeMode===mode?theme.accentText:theme.ink}}>{human(mode)}</Text></Pressable>)}</View>
   <View style={s.controlRow}><Control label={pickedImage?'Change image':'Choose & crop image'} onPress={async()=>{try{const asset=await chooseOwnerSponsoredCreative();if(asset){setPickedImage(asset);setImageUrl('');if(creativeMode==='text_only')setCreativeMode('image_text')}}catch(error:any){setMessage(error?.message||'Image could not be selected.')}}}/>{(pickedImage||imageUrl)?<Control label="Remove image" onPress={()=>{setPickedImage(null);setImageUrl('');setImageAlt('');setCreativeMode('text_only')}}/>:null}</View>
   <Field label="Image URL (optional alternative to upload)" value={imageUrl} onChange={value=>{setImageUrl(value);if(value.trim())setPickedImage(null)}} placeholder="https://…"/>
   <Field label="Image alt text" value={imageAlt} onChange={setImageAlt} placeholder="Describe the sponsored image"/>
   <Field label="Sponsor logo URL (optional)" value={logoUrl} onChange={setLogoUrl} placeholder="https://…"/>
   {(pickedImage?.uri||imageUrl.trim())?<Image source={{uri:pickedImage?.uri||imageUrl.trim()}} accessibilityLabel={imageAlt||'Sponsored creative preview'} resizeMode="cover" style={s.creativeImage}/>:null}
   <Field label="CTA" value={cta} onChange={setCta} placeholder="Learn more"/>
   <Field label="Coarse region (optional)" value={coarseRegion} onChange={setCoarseRegion} placeholder="St. Louis metro"/>
   <Field label="Route context (optional)" value={routeContext} onChange={setRouteContext} placeholder="nearby or route"/>
   <Field label="Amenities (comma separated)" value={amenities} onChange={setAmenities} placeholder="changing table, accessible"/>
   <Field label="Broad interests (comma separated)" value={interests} onChange={setInterests} placeholder="family travel, road trips"/>
   <Text style={[s.meta,{color:theme.muted}]}>Placements</Text>
   <View style={s.chips}>{availablePlacements.map((row:any)=>{const code=String(row.placement_code),selected=selectedPlacements.includes(code);return <Pressable key={code} onPress={()=>togglePlacement(code)} style={[s.chip,{backgroundColor:selected?theme.accent:theme.surfaceRaised,borderColor:selected?theme.accent:theme.line}]}><Text style={{fontWeight:'900',fontSize:10,color:selected?theme.accentText:theme.ink}}>{human(code)}</Text></Pressable>})}</View>
   <View style={s.controlRow}><Pressable style={[s.primary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>createCampaign('draft')}><Text style={{fontWeight:'900',color:theme.accent}}>Save draft</Text></Pressable><Pressable style={[s.primary,{backgroundColor:theme.accent,borderColor:theme.accent}]} onPress={()=>createCampaign('active')}><Text style={{fontWeight:'900',color:theme.accentText}}>Activate</Text></Pressable></View>
  </View>

  <View style={{gap:10}}>
   <SectionHeader title="Campaigns" body="Pause or reactivate paid content without touching organic ranking."/>
   {campaigns.length?campaigns.map((row:any)=><View key={String(row.id)} style={card}><View style={s.row}><View style={{flex:1}}><Text style={[s.title,{color:theme.ink}]}>{row.headline}</Text><Text style={[s.meta,{color:theme.muted}]}>{row.sponsor_name} · {String(row.status).toUpperCase()}</Text></View><StatusPill label={String(row.status).toUpperCase()} tone={row.status==='active'?'good':row.status==='paused'?'warning':'neutral'}/></View>{row.image_url&&row.creative_mode!=='text_only'?<Image source={{uri:String(row.image_url)}} accessibilityLabel={String(row.image_alt||`${row.sponsor_name} sponsored image`)} resizeMode="cover" style={s.creativeImage}/>:null}<Text style={[s.meta,{color:theme.muted}]}>{human(String(row.creative_mode||'text_only'))} · {number(row.impressions)} impressions · {number(row.clicks)} clicks · {(row.placements||[]).map(human).join(' · ')}</Text><View style={s.controlRow}>{row.status==='active'?<Control label="Pause" onPress={()=>setCampaignStatus(row,'paused')}/>:<Control label="Activate" onPress={()=>setCampaignStatus(row,'active')}/>}<Control label="End" onPress={()=>setCampaignStatus(row,'ended')}/></View></View>):<View style={card}><Text style={{color:theme.muted}}>No sponsored campaigns yet. Organic relevance works independently.</Text></View>}
  </View>
 </ScrollView>;
}

function HealthMetric({label,value}:{label:string;value:string|number}){const theme=usePlatformTheme();return <View style={[s.metric,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.metricLabel,{color:theme.muted}]}>{label}</Text><Text style={[s.metricValue,{color:theme.ink}]}>{String(value)}</Text></View>}
function Rule({ok,text}:{ok:boolean;text:string}){const theme=usePlatformTheme();return <View style={s.rule}><Text style={{fontWeight:'900',color:ok?theme.success:theme.danger}}>{ok?'✓':'!'}</Text><Text style={{flex:1,color:theme.ink,fontWeight:'700'}}>{text}</Text></View>}
function Control({label,onPress}:{label:string;onPress:()=>void}){const theme=usePlatformTheme();return <Pressable onPress={onPress} style={[s.control,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={{fontWeight:'900',fontSize:10,color:theme.accent}}>{label}</Text></Pressable>}
function ToggleRow({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}){const theme=usePlatformTheme();return <View style={s.row}><Text style={{flex:1,fontWeight:'800',color:theme.ink}}>{label}</Text><OSSwitch value={value} onValueChange={onChange}/></View>}
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder:string}){const theme=usePlatformTheme();return <View style={{gap:4}}><Text style={[s.meta,{color:theme.muted}]}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/></View>}

const s=StyleSheet.create({
 row:{flexDirection:'row',alignItems:'center',gap:10},
 title:{fontSize:17,fontWeight:'900'},
 meta:{fontSize:11,lineHeight:16,fontWeight:'700'},
 value:{fontSize:12,fontWeight:'900'},
 rule:{flexDirection:'row',gap:8,alignItems:'flex-start'},
 controlRow:{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'},
 control:{borderWidth:1,borderRadius:999,paddingHorizontal:10,paddingVertical:8},
 presets:{gap:6,borderTopWidth:1,borderTopColor:'#d7e0da',paddingTop:9},
 input:{borderWidth:1,borderRadius:12,paddingHorizontal:11,paddingVertical:10,fontWeight:'700'},
 chips:{flexDirection:'row',gap:7,flexWrap:'wrap'},
 chip:{borderWidth:1,borderRadius:999,paddingHorizontal:10,paddingVertical:8},
 primary:{borderWidth:1,borderRadius:12,paddingHorizontal:13,paddingVertical:11},
 creativeImage:{width:'100%',aspectRatio:16/9,borderRadius:12},
 metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 metric:{minWidth:'46%',flexGrow:1,borderWidth:1,borderRadius:13,padding:11,gap:3},
 metricLabel:{fontSize:9,fontWeight:'900',letterSpacing:.7,textTransform:'uppercase'},
 metricValue:{fontSize:21,fontWeight:'900'},
 healthRow:{borderTopWidth:1,paddingTop:9,flexDirection:'row',alignItems:'center',gap:10},
 failure:{borderTopWidth:1,paddingTop:9,gap:3},
 warning:{fontSize:11,lineHeight:17,fontWeight:'800'},
 good:{fontSize:11,lineHeight:17,fontWeight:'800'},
});
