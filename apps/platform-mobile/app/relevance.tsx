import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { OSHero,OSSwitch,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import { getOwnerRelevanceSponsorshipSnapshot,updateOwnerHeroPolicy,updateOwnerSponsoredPlacement,upsertOwnerSponsoredCampaign } from '../services/ownerAdmin';

const human=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const number=(value:any,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const splitCsv=(value:string)=>value.split(',').map(v=>v.trim()).filter(Boolean);

export default function RelevanceControl(){
 const theme=usePlatformTheme(),card=useOSCardStyle();
 const[data,setData]=useState<any>({hero_policies:[],placements:[],campaigns:[],rules:{}}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const[sponsor,setSponsor]=useState(''),[headline,setHeadline]=useState(''),[body,setBody]=useState(''),[url,setUrl]=useState(''),[cta,setCta]=useState('Learn more'),[coarseRegion,setCoarseRegion]=useState(''),[routeContext,setRouteContext]=useState(''),[amenities,setAmenities]=useState(''),[interests,setInterests]=useState(''),[selectedPlacements,setSelectedPlacements]=useState<string[]>([]);
 const placements=Array.isArray(data?.placements)?data.placements:[],policies=Array.isArray(data?.hero_policies)?data.hero_policies:[],campaigns=Array.isArray(data?.campaigns)?data.campaigns:[];
 const availablePlacements=useMemo(()=>placements.filter((row:any)=>row.owner_enabled!==false&&row.active!==false),[placements]);

 async function load(){setBusy(true);setMessage('');try{setData(await getOwnerRelevanceSponsorshipSnapshot())}catch(error:any){setMessage(error?.message||'Relevance controls could not be loaded.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);

 async function mutate(action:()=>Promise<any>,success:string){setBusy(true);setMessage('');try{await action();setMessage(success);await load()}catch(error:any){setMessage(error?.message||'Update failed.')}finally{setBusy(false)}}
 const tuneHero=(row:any,patch:Record<string,unknown>)=>mutate(()=>updateOwnerHeroPolicy(row,patch),'Organic hero policy updated.');
 const tunePlacement=(row:any,patch:Record<string,unknown>)=>mutate(()=>updateOwnerSponsoredPlacement(row,patch),'Sponsored placement updated.');
 function togglePlacement(code:string){setSelectedPlacements(current=>current.includes(code)?current.filter(x=>x!==code):[...current,code])}

 async function createCampaign(status:'draft'|'active'){
  if(!sponsor.trim()||!headline.trim()||!url.trim()||!selectedPlacements.length){setMessage('Sponsor, headline, destination URL and at least one placement are required.');return}
  const targeting:Record<string,unknown>={};
  if(coarseRegion.trim())targeting.coarse_region=coarseRegion.trim();
  if(routeContext.trim())targeting.route_context=routeContext.trim();
  if(splitCsv(amenities).length)targeting.amenities=splitCsv(amenities);
  if(splitCsv(interests).length)targeting.broad_interests=splitCsv(interests);
  await mutate(()=>upsertOwnerSponsoredCampaign({name:headline.trim(),sponsorName:sponsor.trim(),headline:headline.trim(),body:body.trim(),ctaLabel:cta.trim()||'Learn more',destinationUrl:url.trim(),status,targeting,frequencyCapDaily:2,placementCodes:selectedPlacements}),status==='active'?'Sponsored campaign activated.':'Sponsored campaign saved as draft.');
  setSponsor('');setHeadline('');setBody('');setUrl('');setCta('Learn more');setCoarseRegion('');setRouteContext('');setAmenities('');setInterests('');setSelectedPlacements([]);
 }

 async function setCampaignStatus(row:any,status:'active'|'paused'|'ended'){
  await mutate(()=>upsertOwnerSponsoredCampaign({
    id:String(row.id),name:String(row.name),sponsorName:String(row.sponsor_name),headline:String(row.headline),body:String(row.body||''),ctaLabel:String(row.cta_label||'Learn more'),destinationUrl:String(row.destination_url),
    targetLocationId:row.target_location_id?String(row.target_location_id):null,status,startsAt:row.starts_at||null,endsAt:row.ends_at||null,targeting:row.targeting||{},frequencyCapDaily:number(row.frequency_cap_daily,2),impressionCapTotal:row.impression_cap_total==null?null:number(row.impression_cap_total),ownerPriority:number(row.owner_priority),placementCodes:Array.isArray(row.placements)?row.placements.map(String):[],
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
   {campaigns.length?campaigns.map((row:any)=><View key={String(row.id)} style={card}><View style={s.row}><View style={{flex:1}}><Text style={[s.title,{color:theme.ink}]}>{row.headline}</Text><Text style={[s.meta,{color:theme.muted}]}>{row.sponsor_name} · {String(row.status).toUpperCase()}</Text></View><StatusPill label={String(row.status).toUpperCase()} tone={row.status==='active'?'good':row.status==='paused'?'warning':'neutral'}/></View><Text style={[s.meta,{color:theme.muted}]}>{number(row.impressions)} impressions · {number(row.clicks)} clicks · {(row.placements||[]).map(human).join(' · ')}</Text><View style={s.controlRow}>{row.status==='active'?<Control label="Pause" onPress={()=>setCampaignStatus(row,'paused')}/>:<Control label="Activate" onPress={()=>setCampaignStatus(row,'active')}/>}<Control label="End" onPress={()=>setCampaignStatus(row,'ended')}/></View></View>):<View style={card}><Text style={{color:theme.muted}}>No sponsored campaigns yet. Organic relevance works independently.</Text></View>}
  </View>
 </ScrollView>;
}

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
});
