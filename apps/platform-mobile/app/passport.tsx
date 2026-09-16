import { useEffect,useState } from 'react';
import { Alert,Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import { deleteOwnerPassportStamp,getOwnerPassportSnapshot,listOwnerPassportStamps,upsertOwnerPassportStamp } from '../services/ownerAdmin';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';

const emptyDraft={code:'',name:'',description:'',icon:'✦',category:'achievement',trigger_kind:'system',criteria:'{}',active:true,public_default:true,reward_xp:'0',sort_order:'100'};
function asJson(value:string){const parsed=JSON.parse(value||'{}');if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error('Criteria must be a JSON object.');return parsed;}
function pretty(value:any){return String(value??'').replaceAll('_',' ').replaceAll('-',' ');}

export default function PassportControl(){
 const theme=usePlatformTheme(),card=useOSCardStyle();
 const[stats,setStats]=useState<any>({}),[catalog,setCatalog]=useState<any[]>([]),[draft,setDraft]=useState<any>(emptyDraft),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){setBusy(true);try{const result=await Promise.all([getOwnerPassportSnapshot(),listOwnerPassportStamps()]);setStats(result[0]||{});setCatalog(Array.isArray(result[1])?result[1]:[]);setMessage('');}catch(error:any){setMessage(error?.message||'Passport controls could not be loaded.');}finally{setBusy(false);}}
 useEffect(()=>{void load()},[]);
 function edit(row:any){setEditing(true);setDraft({code:String(row.code||''),name:String(row.name||''),description:String(row.description||''),icon:String(row.icon||'✦'),category:String(row.category||'achievement'),trigger_kind:String(row.trigger_kind||'system'),criteria:JSON.stringify(row.criteria||{},null,2),active:row.active!==false,public_default:row.public_default!==false,reward_xp:String(row.reward_xp||0),sort_order:String(row.sort_order||100)});}
 function reset(){setEditing(false);setDraft(emptyDraft);}
 async function save(){
  setBusy(true);setMessage('');
  try{
   const code=String(draft.code||'').trim().toLowerCase().replace(/\s+/g,'_');
   await upsertOwnerPassportStamp(code,{
    name:String(draft.name||'').trim(),description:String(draft.description||'').trim(),icon:String(draft.icon||'✦').trim()||'✦',
    category:String(draft.category||'achievement').trim(),trigger_kind:String(draft.trigger_kind||'system').trim(),criteria:asJson(String(draft.criteria||'{}')),
    active:Boolean(draft.active),public_default:Boolean(draft.public_default),reward_xp:Math.max(0,Number(draft.reward_xp||0)),sort_order:Number(draft.sort_order||100)
   },editing?'Passport stamp updated in KleenestOS':'Passport stamp created in KleenestOS');
   const wasEditing=editing;reset();await load();setMessage(wasEditing?'Stamp updated.':'Stamp created.');
  }catch(error:any){setMessage(error?.message||'Passport stamp could not be saved.');setBusy(false);}
 }
 async function quickPatch(row:any,patch:Record<string,unknown>){setBusy(true);try{await upsertOwnerPassportStamp(String(row.code),patch,'Passport quick control in KleenestOS');await load();}catch(error:any){setMessage(error?.message||'Passport control update failed.');setBusy(false);}}
 function remove(row:any){
  Alert.alert('Delete Passport stamp?',String(row.name)+' will be removed from the catalog. Existing earned stamp snapshots remain in users’ Passports.',[
   {text:'Cancel',style:'cancel'},
   {text:'Delete',style:'destructive',onPress:()=>void (async()=>{setBusy(true);try{await deleteOwnerPassportStamp(String(row.code),'Passport stamp deleted in KleenestOS');if(editing&&draft.code===row.code)reset();await load();setMessage('Stamp deleted.');}catch(error:any){setMessage(error?.message||'Stamp could not be deleted.');setBusy(false);}})()}
  ]);
 }
 const top=Array.isArray(stats?.top_stamp_types)?stats.top_stamp_types:[];

 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={{padding:14,gap:15,paddingBottom:100,backgroundColor:theme.canvas}}>
  <OSHero eyebrow="KLEENEST PASSPORT" title="PASSPORT CONTROL" body="Operate the stamp catalog and watch adoption. Consumer Passports are event-derived from canonical check-ins, reviews and evidence—not a parallel checklist.">
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
    <StatusPill label={String(Number(stats.users_with_passports||0))+' USERS'} tone="good"/>
    <StatusPill label={String(Number(stats.place_stamps||0))+' PLACE STAMPS'} tone="good"/>
    <StatusPill label={String(Number(stats.achievement_stamps||0))+' ACHIEVEMENTS'} tone="good"/>
    <StatusPill label={String(Number(stats.active_catalog_count||0))+'/'+String(Number(stats.catalog_count||0))+' ACTIVE TYPES'} tone="neutral"/>
   </View>
  </OSHero>

  {message?<View style={{...card}}><Text style={{fontWeight:'800',color:theme.muted}}>{message}</Text></View>:null}

  <View style={{gap:9}}>
   <SectionHeader title={editing?'Edit stamp':'Create stamp'} body="CRUD changes affect future awards. Earned Passport entries keep their historical snapshot." actionLabel={editing?'Cancel edit':undefined} onAction={editing?reset:undefined}/>
   <View style={{...card,gap:9}}>
    <Field label="Code" value={draft.code} onChangeText={(value)=>setDraft({...draft,code:value})} editable={!editing} theme={theme}/>
    <Field label="Name" value={draft.name} onChangeText={(value)=>setDraft({...draft,name:value})} theme={theme}/>
    <Field label="Description" value={draft.description} onChangeText={(value)=>setDraft({...draft,description:value})} multiline theme={theme}/>
    <View style={{flexDirection:'row',gap:8}}>
     <View style={{flex:1}}><Field label="Icon" value={draft.icon} onChangeText={(value)=>setDraft({...draft,icon:value})} theme={theme}/></View>
     <View style={{flex:2}}><Field label="Category" value={draft.category} onChangeText={(value)=>setDraft({...draft,category:value})} theme={theme}/></View>
    </View>
    <Field label="Trigger kind" value={draft.trigger_kind} onChangeText={(value)=>setDraft({...draft,trigger_kind:value})} theme={theme}/>
    <Field label="Criteria JSON" value={draft.criteria} onChangeText={(value)=>setDraft({...draft,criteria:value})} multiline theme={theme}/>
    <View style={{flexDirection:'row',gap:8}}>
     <View style={{flex:1}}><Field label="Reward XP" value={draft.reward_xp} onChangeText={(value)=>setDraft({...draft,reward_xp:value.replace(/[^0-9]/g,'')})} theme={theme}/></View>
     <View style={{flex:1}}><Field label="Sort order" value={draft.sort_order} onChangeText={(value)=>setDraft({...draft,sort_order:value.replace(/[^0-9-]/g,'')})} theme={theme}/></View>
    </View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
     <Toggle label={draft.active?'ACTIVE':'PAUSED'} selected={draft.active} onPress={()=>setDraft({...draft,active:!draft.active})} theme={theme}/>
     <Toggle label={draft.public_default?'PUBLIC BY DEFAULT':'PRIVATE BY DEFAULT'} selected={draft.public_default} onPress={()=>setDraft({...draft,public_default:!draft.public_default})} theme={theme}/>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={editing?'Save Passport stamp changes':'Create Passport stamp'} disabled={busy||!String(draft.code).trim()||!String(draft.name).trim()} onPress={()=>void save()} style={{padding:13,borderRadius:13,backgroundColor:theme.accent,opacity:busy?0.55:1}}>
     <Text style={{fontWeight:'900',textAlign:'center',color:theme.accentText}}>{editing?'SAVE CHANGES':'CREATE STAMP'}</Text>
    </Pressable>
   </View>
  </View>

  <View style={{gap:9}}>
   <SectionHeader title="Stamp catalog" body="Pause, change defaults, edit criteria or delete a catalog type without rewriting a user's earned history."/>
   {catalog.map((row:any)=><View key={String(row.code)} style={{...card,gap:9}}>
    <View style={{flexDirection:'row',gap:10,alignItems:'center'}}>
     <View style={{width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:theme.accentSoft}}><Text style={{fontSize:23}}>{row.icon||'✦'}</Text></View>
     <View style={{flex:1}}><Text style={{fontSize:17,fontWeight:'900',color:theme.ink}}>{row.name}</Text><Text style={{fontSize:11,fontWeight:'800',color:theme.muted}}>{row.code} · {pretty(row.category)} · {pretty(row.trigger_kind)}</Text></View>
     <StatusPill label={row.active?'ACTIVE':'PAUSED'} tone={row.active?'good':'warning'}/>
    </View>
    <Text style={{fontSize:13,lineHeight:19,color:theme.muted}}>{row.description||'No description.'}</Text>
    <Text style={{fontSize:11,color:theme.muted}}>Criteria · {JSON.stringify(row.criteria||{})}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
     <Action label="EDIT" onPress={()=>edit(row)} theme={theme}/>
     <Action label={row.active?'PAUSE':'ACTIVATE'} onPress={()=>void quickPatch(row,{active:!row.active})} theme={theme}/>
     <Action label={row.public_default?'DEFAULT PRIVATE':'DEFAULT PUBLIC'} onPress={()=>void quickPatch(row,{public_default:!row.public_default})} theme={theme}/>
     <Action label="DELETE" onPress={()=>remove(row)} theme={theme} danger/>
    </View>
   </View>)}
  </View>

  <View style={{gap:9}}>
   <SectionHeader title="Live Passport signals" body="This is adoption telemetry, not a leaderboard. It helps Owner see whether the mechanic is filling naturally."/>
   <View style={{...card,gap:8}}>
    <Text style={{fontWeight:'900',color:theme.ink}}>{Number(stats.verified_visits||0).toLocaleString()} verified visits represented</Text>
    {top.length?top.map((row:any)=><View key={String(row.code)} style={{flexDirection:'row',gap:8}}><Text style={{flex:1,color:theme.muted,fontWeight:'800'}}>{pretty(row.code)}</Text><Text style={{color:theme.ink,fontWeight:'900'}}>{Number(row.count||0).toLocaleString()}</Text></View>):<Text style={{color:theme.muted}}>No Passport achievement activity yet.</Text>}
   </View>
  </View>
 </ScrollView>;
}

function Field({label,value,onChangeText,multiline=false,editable=true,theme}:{label:string;value:string;onChangeText:(value:string)=>void;multiline?:boolean;editable?:boolean;theme:any}){return <View style={{gap:4}}><Text style={{fontSize:10,fontWeight:'900',color:theme.muted}}>{label.toUpperCase()}</Text><TextInput accessibilityLabel={label} value={value} editable={editable} multiline={multiline} onChangeText={onChangeText} style={{borderWidth:1,borderColor:theme.line,backgroundColor:theme.surfaceRaised,color:theme.ink,borderRadius:12,padding:11,minHeight:multiline?78:46,textAlignVertical:multiline?'top':'center',opacity:editable?1:0.65}}/></View>;}
function Toggle({label,selected,onPress,theme}:{label:string;selected:boolean;onPress:()=>void;theme:any}){return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={{borderWidth:1,borderColor:selected?theme.accent:theme.line,backgroundColor:selected?theme.accentSoft:theme.surfaceRaised,borderRadius:999,paddingHorizontal:10,paddingVertical:8}}><Text style={{fontSize:10,fontWeight:'900',color:selected?theme.accent:theme.muted}}>{label}</Text></Pressable>;}
function Action({label,onPress,theme,danger=false}:{label:string;onPress:()=>void;theme:any;danger?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{borderWidth:1,borderColor:danger?theme.danger:theme.line,backgroundColor:theme.surfaceRaised,borderRadius:999,paddingHorizontal:10,paddingVertical:8}}><Text style={{fontSize:10,fontWeight:'900',color:danger?theme.danger:theme.accent}}>{label}</Text></Pressable>;}
