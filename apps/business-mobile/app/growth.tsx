import { useEffect,useMemo,useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Image,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { BarChart,BusinessCard,BusinessHero,SectionHeader,businessColors } from '../components/BusinessOS';
import { deleteBusinessMedia,disputeBusinessReviewPhoto,getBusinessDashboard,getBusinessGrowth,listBusinessLocationCommunityPhotos,manageBusinessCampaign,manageBusinessContest,manageBusinessEvent,manageBusinessPromotion,updateBusinessMedia } from '../services/product';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { businessLocationPhotoUrl,businessReviewPhotoUrl,pickAndUploadBusinessLocationPhoto,voteBusinessReviewPhoto } from '../services/media';

type Row=Record<string,any>;
function list(value:any,keys:string[]=[]):Row[]{if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return[]}

export default function Growth(){
 const params=useLocalSearchParams<{location?:string}>();
 const requestedLocationId=String(params.location||'');
 const[businessId,setBusinessId]=useState(''),[data,setData]=useState<any>(null),[locations,setLocations]=useState<Row[]>([]);
 const[promotion,setPromotion]=useState(''),[campaign,setCampaign]=useState(''),[contest,setContest]=useState(''),[event,setEvent]=useState('');
 const[mediaLocationId,setMediaLocationId]=useState(''),[mediaCaption,setMediaCaption]=useState(''),[editingMedia,setEditingMedia]=useState<Row|null>(null),[editCaption,setEditCaption]=useState('');
 const[communityPhotos,setCommunityPhotos]=useState<Row[]>([]),[disputing,setDisputing]=useState<Row|null>(null),[disputeReason,setDisputeReason]=useState(''),[disputeDetails,setDisputeDetails]=useState('');
 const[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading growth programs…');

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentBusinessId();setBusinessId(id);
   const[growth,dashboard]=await Promise.all([getBusinessGrowth(id),getBusinessDashboard(id)]);
   setData(growth);const rows=Array.isArray(dashboard?.locations)?dashboard.locations:[];setLocations(rows);
   if(!mediaLocationId){const preferred=rows.find((row:any)=>String(row.id||row.location_id||'')===requestedLocationId)||rows[0];if(preferred)setMediaLocationId(String(preferred.id||preferred.location_id||''));}
   setMessage('');
  }catch(e:any){setMessage(e?.message||'Growth programs unavailable.')}finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[]);
 async function loadCommunity(locationId=mediaLocationId){
  if(!businessId||!locationId){setCommunityPhotos([]);return}
  try{const rows=await listBusinessLocationCommunityPhotos(businessId,locationId);setCommunityPhotos(Array.isArray(rows)?rows:[])}
  catch(e:any){setCommunityPhotos([]);setMessage(e?.message||'Community photo evidence unavailable.')}
 }
 useEffect(()=>{if(businessId&&mediaLocationId)void loadCommunity(mediaLocationId)},[businessId,mediaLocationId]);

 async function run(fn:()=>Promise<unknown>,success:string,clear?:()=>void){
  setBusy(true);try{await fn();clear?.();setMessage(success);await load()}catch(e:any){setMessage(e?.message||'Growth action failed.')}finally{setBusy(false)}
 }
 const promotions=list(data?.promotions,['promotions','items','rows']),contests=list(data?.contests,['contests','items','rows']),events=list(data?.events,['events','items','rows']),media=list(data?.media,['media','items','rows']);
 const programMix=useMemo(()=>[
  {label:'Promotions',value:promotions.length},{label:'Contests',value:contests.length},{label:'Events',value:events.length},{label:'Media',value:media.length}
 ],[promotions.length,contests.length,events.length,media.length]);

 async function uploadMedia(){
  if(!mediaLocationId)return setMessage('Choose a managed location first.');
  await run(()=>pickAndUploadBusinessLocationPhoto(businessId,mediaLocationId,mediaCaption.trim()||undefined),'Official location photo added to the Business media library.',()=>setMediaCaption(''));
 }
 async function saveMedia(){
  if(!editingMedia)return;
  const mediaId=String(editingMedia.media_id||editingMedia.id||'');
  const storage=String(editingMedia.storage_path||editingMedia.path||'');
  await run(()=>updateBusinessMedia(businessId,mediaId,storage,editCaption.trim(),String(editingMedia.media_type||'image'),Number(editingMedia.sort_order||0)),'Media details updated.',()=>{setEditingMedia(null);setEditCaption('')});
 }
 async function votePhoto(photoId:string,vote:'helpful'|'not_helpful'){
  setBusy(true);
  try{
   await voteBusinessReviewPhoto(businessId,photoId,vote);
   setMessage(vote==='helpful'?'Helpful photo vote saved.':'Not-helpful photo vote saved.');
   await loadCommunity(mediaLocationId);
  }catch(e:any){setMessage(e?.message||'Photo vote could not be saved.')}finally{setBusy(false)}
 }
 async function submitDispute(){
  if(!disputing||!disputeReason.trim())return;
  setBusy(true);
  try{
   await disputeBusinessReviewPhoto(businessId,String(disputing.review_photo_id||''),disputeReason.trim(),disputeDetails.trim()||null);
   setMessage('Community photo dispute sent to KleenestOS owner moderation. The photo remains community evidence unless owner moderation determines otherwise.');
   setDisputing(null);setDisputeReason('');setDisputeDetails('');
   await loadCommunity(mediaLocationId);
  }catch(e:any){setMessage(e?.message||'Photo dispute could not be submitted.')}finally{setBusy(false)}
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

  <BusinessCard><SectionHeader title="Official location media" body="Upload Business-owned imagery for the location profile and brand context. Official media is kept separate from user-supplied community evidence and cannot be used to curate the community trust photo."/>
   <Text style={s.label}>LOCATION</Text><View style={s.chips}>{locations.map(row=>{const id=String(row.id||row.location_id||'');return <Chip key={id} label={String(row.name||row.location_name||'Location')} active={id===mediaLocationId} onPress={()=>setMediaLocationId(id)}/>})}</View>
   <TextInput style={s.input} placeholder="Optional official photo caption" value={mediaCaption} onChangeText={setMediaCaption}/>
   <Action label={busy?'Working…':'Add official photo'} disabled={busy||!mediaLocationId} onPress={uploadMedia}/>
  </BusinessCard>

  {editingMedia?<BusinessCard><SectionHeader title="Edit media" body={String(editingMedia.location_name||'Business media')}/><TextInput style={s.input} value={editCaption} onChangeText={setEditCaption} placeholder="Caption"/><View style={s.actions}><Action label="Save media" disabled={busy} onPress={saveMedia}/><Action quiet label="Cancel" onPress={()=>setEditingMedia(null)}/></View></BusinessCard>:null}

  <ProgramSection title="Promotions" rows={promotions} empty="No active promotions."/>
  <ProgramSection title="Contests" rows={contests} empty="No contests yet."/>
  <ProgramSection title="Events" rows={events} empty="No events yet."/>
  <View style={s.section}><SectionHeader title="Official media library" body="Business-owned photos attached to managed locations. These support brand and profile context; they do not override user-supplied trust imagery."/>
   {media.length?media.slice(0,30).map((row,index)=>{const id=String(row.media_id||row.id||index),photoUrl=businessLocationPhotoUrl(String(row.storage_path||''));return <BusinessCard key={id}><View style={s.item}>{photoUrl?<Image source={{uri:photoUrl}} style={s.mediaThumb}/>:null}<View style={{flex:1}}><Text style={s.itemTitle}>{String(row.caption||row.location_name||'Official Business media')}</Text><Text style={s.meta}>{[row.location_name,row.media_type,row.mime_type].filter(Boolean).join(' · ')||'Official Business media'}</Text><Text style={s.meta}>Controlled by the Business as official profile media, separate from community evidence.</Text></View></View><View style={s.actions}><Action quiet label="Edit" onPress={()=>{setEditingMedia(row);setEditCaption(String(row.caption||''))}}/><Action danger label="Delete" disabled={busy} onPress={()=>run(()=>deleteBusinessMedia(businessId,id),'Official media removed.')}/></View></BusinessCard>}):<View style={s.empty}><Text style={s.meta}>No official Business media yet.</Text></View>}
  </View>

  <View style={s.section}><SectionHeader title="Community photo evidence" body="User-supplied review photos determine the consumer trust image using freshness first, then contributor trust, then exact recency. Businesses cannot choose or reorder these photos; they can vote on usefulness and flag or dispute evidence for immediate KleenestOS owner moderation."/>
   {communityPhotos.length?communityPhotos.slice(0,30).map((row,index)=>{const id=String(row.review_photo_id||index),photoUrl=businessReviewPhotoUrl(String(row.storage_path||'')),disputed=['open','reviewing'].includes(String(row.dispute_status||''));return <BusinessCard key={id}><View style={s.item}>{photoUrl?<Image source={{uri:photoUrl}} style={s.mediaThumb}/>:null}<View style={{flex:1,gap:2}}><View style={s.mediaTitleRow}><Text style={s.itemTitle}>{String(row.display_name||row.username||'Kleenest contributor')}</Text>{index===0?<Pill label="TRUST + FRESH LEADER"/>:null}{disputed?<Pill label="DISPUTED"/>:null}</View><Text style={s.meta}>Trust {Math.round(Number(row.reputation_score||0))} · {String(row.verification_level||'new')} · {row.verified_visit?'verified visit':'published review'}</Text><Text style={s.meta}>{row.review_created_at?new Date(String(row.review_created_at)).toLocaleDateString():'Review date unavailable'}</Text></View></View><View style={s.actions}><Action quiet label={`Helpful · ${Number(row.helpful_votes||0)}`} disabled={busy} onPress={()=>votePhoto(id,'helpful')}/><Action quiet label={`Not helpful · ${Number(row.not_helpful_votes||0)}`} disabled={busy} onPress={()=>votePhoto(id,'not_helpful')}/><Action danger label={disputed?'Update dispute':'Flag / dispute'} disabled={busy} onPress={()=>{setDisputing(row);setDisputeReason(String(row.dispute_reason||''));setDisputeDetails('')}}/></View></BusinessCard>}):<View style={s.empty}><Text style={s.meta}>No community review photos for this location yet.</Text></View>}
  </View>

  {disputing?<BusinessCard><SectionHeader title="Flag / dispute community photo" body="A dispute is sent immediately to the KleenestOS owner moderation queue. It does not let the Business remove, hide, rank or select a user photo."/><Text style={s.label}>REASON</Text><View style={s.chips}>{['Wrong location','Outdated','Misleading','Privacy concern','Inappropriate','Other'].map(reason=><Chip key={reason} label={reason} active={disputeReason===reason} onPress={()=>setDisputeReason(reason)}/>)}</View><TextInput multiline style={[s.input,s.details]} placeholder="Optional details for moderation" value={disputeDetails} onChangeText={setDisputeDetails} maxLength={2000}/><View style={s.actions}><Action label="Submit dispute" disabled={busy||!disputeReason.trim()} onPress={submitDispute}/><Action quiet label="Cancel" onPress={()=>{setDisputing(null);setDisputeReason('');setDisputeDetails('')}}/></View></BusinessCard>:null}
 </ScrollView>
}

function ProgramSection({title,rows,empty}:{title:string;rows:Row[];empty:string}){return <View style={s.section}><SectionHeader title={title}/>{rows.length?rows.slice(0,20).map((row,index)=><BusinessCard key={String(row.id||row.promotion_id||row.contest_id||row.event_id||index)}><View style={s.item}><View style={{flex:1}}><Text style={s.itemTitle}>{String(row.title||row.name||title.slice(0,-1))}</Text><Text style={s.meta}>{[row.status,row.active===false?'inactive':row.active===true?'active':null,row.starts_at,row.event_date,row.location_name].filter(Boolean).join(' · ')||'Canonical Business program'}</Text></View><Pill label={String(row.status||(row.active===false?'INACTIVE':'ACTIVE')).toUpperCase()}/></View></BusinessCard>):<View style={s.empty}><Text style={s.meta}>{empty}</Text></View>}</View>}
function Metric({label,value}:{label:string;value:number}){return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.meta}>{label}</Text></View>}
function Action({label,onPress,disabled,quiet=false,danger=false}:{label:string;onPress:()=>void|Promise<void>;disabled?:boolean;quiet?:boolean;danger?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.action,quiet&&s.actionQuiet,danger&&s.actionDanger,disabled&&{opacity:.45}]}><Text style={[s.actionText,(quiet||danger)&&{color:danger?businessColors.danger:businessColors.green}]}>{label}</Text></Pressable>}
function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[s.chip,active&&s.chipOn]}><Text style={[s.chipText,active&&s.chipTextOn]}>{label}</Text></Pressable>}
function Pill({label}:{label:string}){return <View style={s.pill}><Text style={s.pillText}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:businessColors.paper,paddingBottom:70},message:{fontWeight:'700',color:'#596b61'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#fff',borderRadius:16,padding:13,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:22,fontWeight:'900',color:businessColors.green},meta:{fontSize:12,lineHeight:18,color:businessColors.muted},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:11,backgroundColor:'#fafcfb',color:businessColors.ink},action:{backgroundColor:businessColors.green,padding:11,borderRadius:12,alignItems:'center'},actionQuiet:{backgroundColor:'#edf3ef'},actionDanger:{backgroundColor:'#fff0f0'},actionText:{color:'#fff',fontWeight:'900'},section:{gap:8},item:{flexDirection:'row',alignItems:'center',gap:8},itemTitle:{fontSize:15,fontWeight:'900',color:businessColors.ink},pill:{backgroundColor:'#edf3ef',borderRadius:999,paddingHorizontal:8,paddingVertical:5},pillText:{fontSize:9,fontWeight:'900',color:'#31533f'},empty:{backgroundColor:'#eef3f0',padding:13,borderRadius:14},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{backgroundColor:'#edf3ef',paddingHorizontal:10,paddingVertical:7,borderRadius:999},chipOn:{backgroundColor:businessColors.green},chipText:{fontSize:10,fontWeight:'800',color:'#315440'},chipTextOn:{color:'#fff'},label:{fontSize:9,fontWeight:'900',letterSpacing:1,color:businessColors.green},actions:{flexDirection:'row',gap:8,flexWrap:'wrap'},mediaThumb:{width:82,height:82,borderRadius:14,backgroundColor:'#e8eeea'},mediaTitleRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},details:{minHeight:92,textAlignVertical:'top'}});
