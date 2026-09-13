import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { BarChart,BusinessCard,BusinessHero,SectionHeader,businessColors } from '../components/BusinessOS';
import { deleteBusinessMedia,getBusinessDashboard,getBusinessGrowth,manageBusinessCampaign,manageBusinessContest,manageBusinessEvent,manageBusinessPromotion,updateBusinessMedia } from '../services/product';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { pickAndUploadBusinessLocationPhoto } from '../services/media';

type Row=Record<string,any>;
function list(value:any,keys:string[]=[]):Row[]{if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return[]}
function idOf(row:Row){return String(row.media_id||row.id||row.location_id||'')}

export default function Growth(){
 const[businessId,setBusinessId]=useState(''),[data,setData]=useState<any>(null),[locations,setLocations]=useState<Row[]>([]);
 const[promotion,setPromotion]=useState(''),[campaign,setCampaign]=useState(''),[contest,setContest]=useState(''),[event,setEvent]=useState('');
 const[mediaLocationId,setMediaLocationId]=useState(''),[mediaCaption,setMediaCaption]=useState(''),[editingMedia,setEditingMedia]=useState<Row|null>(null),[editCaption,setEditCaption]=useState('');
 const[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading growth programs…');

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentBusinessId();setBusinessId(id);
   const[growth,dashboard]=await Promise.all([getBusinessGrowth(id),getBusinessDashboard(id)]);
   setData(growth);const rows=Array.isArray(dashboard?.locations)?dashboard.locations:[];setLocations(rows);
   if(!mediaLocationId&&rows[0])setMediaLocationId(String(rows[0].id||rows[0].location_id||''));
   setMessage('');
  }catch(e:any){setMessage(e?.message||'Growth programs unavailable.')}finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);

 async function run(fn:()=>Promise<unknown>,success:string,clear?:()=>void){
  setBusy(true);try{await fn();clear?.();setMessage(success);await load()}catch(e:any){setMessage(e?.message||'Growth action failed.')}finally{setBusy(false)}
 }
 const promotions=list(data?.promotions,['promotions','items','rows']),contests=list(data?.contests,['contests','items','rows']),events=list(data?.events,['events','items','rows']),media=list(data?.media,['media','items','rows']);
 const programMix=useMemo(()=>[
  {label:'Promotions',value:promotions.length},{label:'Contests',value:contests.length},{label:'Events',value:events.length},{label:'Media',value:media.length}
 ],[promotions.length,contests.length,events.length,media.length]);

 async function uploadMedia(){
  if(!mediaLocationId)return setMessage('Choose a managed location first.');
  await run(()=>pickAndUploadBusinessLocationPhoto(businessId,mediaLocationId,mediaCaption.trim()||undefined),'Location photo added to the Business media library.',()=>setMediaCaption(''));
 }
 async function saveMedia(){
  if(!editingMedia)return;
  const mediaId=String(editingMedia.media_id||editingMedia.id||'');
  const storage=String(editingMedia.storage_path||editingMedia.path||'');
  await run(()=>updateBusinessMedia(businessId,mediaId,storage,editCaption.trim(),String(editingMedia.media_type||'image'),Number(editingMedia.sort_order||0)),'Media details updated.',()=>{setEditingMedia(null);setEditCaption('')});
 }

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
  <BusinessHero eyebrow="GROWTH & ENGAGEMENT" title="Programs that connect to real visits." body="Promotions, campaigns, contests, events, media and QR programs share the same Business identity, location IDs, progression and analytics contracts."/>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <View style={s.metrics}><Metric label="Promotions" value={promotions.length}/><Metric label="Contests" value={contests.length}/><Metric label="Events" value={events.length}/><Metric label="Media" value={media.length}/></View>
  <BarChart title="Program mix" subtitle="Current Business growth assets by type" items={programMix}/>

  <BusinessCard><SectionHeader title="Create a program" body="Launch customer-facing programs without leaving the Business control center."/>
   <TextInput style={s.input} placeholder="Promotion title" value={promotion} onChangeText={setPromotion}/><Action label="Create promotion" disabled={busy||!promotion.trim()} onPress={()=>run(()=>manageBusinessPromotion(businessId,null,'create',{title:promotion.trim(),name:promotion.trim(),active:true}),'Promotion created.',()=>setPromotion(''))}/>
   <TextInput style={s.input} placeholder="Campaign name" value={campaign} onChangeText={setCampaign}/><Action label="Create campaign" disabled={busy||!campaign.trim()} onPress={()=>run(()=>manageBusinessCampaign(businessId,null,'create',campaign.trim(),'engagement','Increase verified engagement','active'),'Campaign created.',()=>setCampaign(''))}/>
   <TextInput style={s.input} placeholder="Contest name" value={contest} onChangeText={setContest}/><Action label="Create contest" disabled={busy||!contest.trim()} onPress={()=>run(()=>manageBusinessContest(businessId,null,'create',{name:contest.trim(),description:'Business engagement contest'}),'Contest created.',()=>setContest(''))}/>
   <TextInput style={s.input} placeholder="Event title" value={event} onChangeText={setEvent}/><Action label="Create event" disabled={busy||!event.trim()} onPress={()=>run(()=>manageBusinessEvent(businessId,null,'create',{title:event.trim(),description:'Business event'}),'Event created.',()=>setEvent(''))}/>
  </BusinessCard>

  <BusinessCard><SectionHeader title="Media library" body="Attach customer-facing photos to a canonical managed location, then edit or remove them here."/>
   <Text style={s.label}>LOCATION</Text><View style={s.chips}>{locations.map(row=>{const id=String(row.id||row.location_id||'');return <Chip key={id} label={String(row.name||row.location_name||'Location')} active={id===mediaLocationId} onPress={()=>setMediaLocationId(id)}/>})}</View>
   <TextInput style={s.input} placeholder="Optional photo caption" value={mediaCaption} onChangeText={setMediaCaption}/>
   <Action label={busy?'Working…':'Add location photo'} disabled={busy||!mediaLocationId} onPress={uploadMedia}/>
  </BusinessCard>

  {editingMedia?<BusinessCard><SectionHeader title="Edit media" body={String(editingMedia.location_name||'Business media')}/><TextInput style={s.input} value={editCaption} onChangeText={setEditCaption} placeholder="Caption"/><View style={s.actions}><Action label="Save media" disabled={busy} onPress={saveMedia}/><Action quiet label="Cancel" onPress={()=>setEditingMedia(null)}/></View></BusinessCard>:null}

  <ProgramSection title="Promotions" rows={promotions} empty="No active promotions."/>
  <ProgramSection title="Contests" rows={contests} empty="No contests yet."/>
  <ProgramSection title="Events" rows={events} empty="No events yet."/>
  <View style={s.section}><SectionHeader title="Media" body="Photos and other Business media attached to locations."/>
   {media.length?media.slice(0,30).map((row,index)=>{const id=String(row.media_id||row.id||index);return <BusinessCard key={id}><View style={s.item}><View style={{flex:1}}><Text style={s.itemTitle}>{String(row.caption||row.location_name||'Business media')}</Text><Text style={s.meta}>{[row.location_name,row.media_type,row.mime_type].filter(Boolean).join(' · ')||'Business media'}</Text></View><Pill label={String(row.media_type||'MEDIA').toUpperCase()}/></View><View style={s.actions}><Action quiet label="Edit" onPress={()=>{setEditingMedia(row);setEditCaption(String(row.caption||''))}}/><Action danger label="Delete" disabled={busy} onPress={()=>run(()=>deleteBusinessMedia(businessId,String(row.media_id||row.id)),'Media removed.')}/></View></BusinessCard>}):<View style={s.empty}><Text style={s.meta}>No Business media yet.</Text></View>}
  </View>
 </ScrollView>
}

function ProgramSection({title,rows,empty}:{title:string;rows:Row[];empty:string}){return <View style={s.section}><SectionHeader title={title}/>{rows.length?rows.slice(0,20).map((row,index)=><BusinessCard key={String(row.id||row.promotion_id||row.contest_id||row.event_id||index)}><View style={s.item}><View style={{flex:1}}><Text style={s.itemTitle}>{String(row.title||row.name||title.slice(0,-1))}</Text><Text style={s.meta}>{[row.status,row.active===false?'inactive':row.active===true?'active':null,row.starts_at,row.event_date,row.location_name].filter(Boolean).join(' · ')||'Canonical Business program'}</Text></View><Pill label={String(row.status||(row.active===false?'INACTIVE':'ACTIVE')).toUpperCase()}/></View></BusinessCard>):<View style={s.empty}><Text style={s.meta}>{empty}</Text></View>}</View>}
function Metric({label,value}:{label:string;value:number}){return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.meta}>{label}</Text></View>}
function Action({label,onPress,disabled,quiet=false,danger=false}:{label:string;onPress:()=>void|Promise<void>;disabled?:boolean;quiet?:boolean;danger?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.action,quiet&&s.actionQuiet,danger&&s.actionDanger,disabled&&{opacity:.45}]}><Text style={[s.actionText,(quiet||danger)&&{color:danger?businessColors.danger:businessColors.green}]}>{label}</Text></Pressable>}
function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[s.chip,active&&s.chipOn]}><Text style={[s.chipText,active&&s.chipTextOn]}>{label}</Text></Pressable>}
function Pill({label}:{label:string}){return <View style={s.pill}><Text style={s.pillText}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:businessColors.paper,paddingBottom:70},message:{fontWeight:'700',color:'#596b61'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#fff',borderRadius:16,padding:13,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:22,fontWeight:'900',color:businessColors.green},meta:{fontSize:12,lineHeight:18,color:businessColors.muted},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:11,backgroundColor:'#fafcfb',color:businessColors.ink},action:{backgroundColor:businessColors.green,padding:11,borderRadius:12,alignItems:'center'},actionQuiet:{backgroundColor:'#edf3ef'},actionDanger:{backgroundColor:'#fff0f0'},actionText:{color:'#fff',fontWeight:'900'},section:{gap:8},item:{flexDirection:'row',alignItems:'center',gap:8},itemTitle:{fontSize:15,fontWeight:'900',color:businessColors.ink},pill:{backgroundColor:'#edf3ef',borderRadius:999,paddingHorizontal:8,paddingVertical:5},pillText:{fontSize:9,fontWeight:'900',color:'#31533f'},empty:{backgroundColor:'#eef3f0',padding:13,borderRadius:14},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{backgroundColor:'#edf3ef',paddingHorizontal:10,paddingVertical:7,borderRadius:999},chipOn:{backgroundColor:businessColors.green},chipText:{fontSize:10,fontWeight:'800',color:'#315440'},chipTextOn:{color:'#fff'},label:{fontSize:9,fontWeight:'900',letterSpacing:1,color:businessColors.green},actions:{flexDirection:'row',gap:8,flexWrap:'wrap'}});
