import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import {
  getOwnerFeedbackQueueSummary,
  listOwnerFeedbackQueue,
  updateOwnerFeedbackEvent,
  type FeedbackOwnerQueue,
  type FeedbackOwnerStatus,
  type OwnerFeedbackQueueItem,
  type OwnerFeedbackQueueSummary,
} from '@kleenest/mobile-core';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';

type QueueFilter=Exclude<FeedbackOwnerQueue,'incident'>|'all';
type StatusFilter=FeedbackOwnerStatus|'all';

const queueOptions:Array<{key:Exclude<FeedbackOwnerQueue,'incident'>;label:string;body:string}>=[
  {key:'ux_friction',label:'UX FRICTION',body:'Confusing, hard-to-find, or frustrating product experiences.'},
  {key:'product_gap',label:'PRODUCT GAPS',body:'Things people expected Kleenest to do or show but could not find.'},
  {key:'ideas',label:'IDEAS',body:'User-proposed improvements and new opportunities.'},
  {key:'voice_of_customer',label:'VOICE OF CUSTOMER',body:'Positive, general, and qualitative customer feedback worth retaining.'},
];
const statusOptions:StatusFilter[]=['all','new','reviewing','planned','resolved','archived'];
const actionStatuses:FeedbackOwnerStatus[]=['reviewing','planned','resolved','archived'];

function when(value:string){try{return new Date(value).toLocaleString()}catch{return value}}
function queueLabel(queue:FeedbackOwnerQueue){return queueOptions.find(item=>item.key===queue)?.label||'INCIDENT'}
function queueTone(queue:FeedbackOwnerQueue):'good'|'warning'|'danger'|'neutral'{
  if(queue==='ux_friction')return'warning';
  if(queue==='product_gap')return'danger';
  if(queue==='ideas')return'good';
  return'neutral';
}
function statusTone(status:FeedbackOwnerStatus):'good'|'warning'|'danger'|'neutral'{
  if(status==='new')return'warning';
  if(status==='planned'||status==='resolved')return'good';
  return'neutral';
}

export default function FeedbackInbox(){
  const theme=usePlatformTheme();
  const card=useOSCardStyle();
  const[queue,setQueue]=useState<QueueFilter>('all');
  const[status,setStatus]=useState<StatusFilter>('all');
  const[rows,setRows]=useState<OwnerFeedbackQueueItem[]>([]);
  const[summary,setSummary]=useState<OwnerFeedbackQueueSummary|null>(null);
  const[notes,setNotes]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');

  async function load(nextQueue:QueueFilter=queue,nextStatus:StatusFilter=status){
    setBusy(true);
    try{
      const [nextSummary,nextRows]=await Promise.all([
        getOwnerFeedbackQueueSummary(),
        listOwnerFeedbackQueue(nextQueue==='all'?null:nextQueue,nextStatus==='all'?null:nextStatus,240),
      ]);
      setSummary(nextSummary);
      setRows(nextRows);
      setNotes(current=>{const copy={...current};for(const row of nextRows)if(copy[row.id]===undefined)copy[row.id]=row.owner_note||'';return copy;});
      setMessage('');
    }catch(error:any){setMessage(error?.message||'Tell Kleenest feedback could not be loaded.')}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load(queue,status)},[queue,status]);

  async function update(row:OwnerFeedbackQueueItem,nextStatus:FeedbackOwnerStatus,nextQueue:FeedbackOwnerQueue=row.owner_queue){
    setBusy(true);
    try{
      await updateOwnerFeedbackEvent(row.id,nextStatus,notes[row.id]||null,nextQueue);
      setMessage('Feedback routing/status updated.');
      await load(queue,status);
    }catch(error:any){setMessage(error?.message||'Feedback update failed.');setBusy(false)}
  }

  const openCount=useMemo(()=>rows.filter(row=>!['resolved','archived'].includes(row.owner_status)).length,[rows]);

  return <ScrollView
    refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load(queue,status)}/>}
    contentContainerStyle={{padding:16,paddingBottom:80,gap:14,backgroundColor:theme.canvas}}
  >
    <OSHero
      eyebrow="KLEENESTOS · CUSTOMER SIGNALS"
      title="TELL KLEENEST INBOX"
      body="Feedback keeps its diagnostics and provenance, but owner work is routed by what the person actually meant—not forced into a bug queue."
    >
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
        <StatusPill label={`${openCount} OPEN IN VIEW`} tone={openCount?'warning':'good'}/>
        <StatusPill label={`${Number(summary?.new_total||0)} NEW TOTAL`} tone={Number(summary?.new_total||0)?'warning':'neutral'}/>
      </View>
    </OSHero>

    {message?<View style={{...card,borderColor:theme.warning}}><Text style={{color:theme.warning,fontWeight:'800'}}>{message}</Text></View>:null}

    <View style={{gap:9}}>
      <SectionHeader title="Owner queues" body="Automatic routing stays editable. If feedback was classified poorly, move it without changing what the user originally said."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {queueOptions.map(item=>{
          const count=Number(summary?.[item.key]||0);
          const active=queue===item.key;
          return <Pressable key={item.key} onPress={()=>setQueue(active?'all':item.key)} style={{...card,minWidth:'47%',flexGrow:1,flexBasis:150,borderColor:active?theme.accent:theme.line,backgroundColor:active?theme.accentSoft:theme.surface}}>
            <Text style={{fontSize:9,fontWeight:'900',letterSpacing:1,color:theme.accent}}>{item.label}</Text>
            <Text style={{fontSize:26,fontWeight:'900',color:theme.ink}}>{count}</Text>
            <Text style={{fontSize:11,lineHeight:16,color:theme.muted}}>{item.body}</Text>
          </Pressable>;
        })}
        <Link href="/beta-incidents" asChild>
          <Pressable style={{...card,minWidth:'47%',flexGrow:1,flexBasis:150}}>
            <Text style={{fontSize:9,fontWeight:'900',letterSpacing:1,color:theme.danger}}>INCIDENTS</Text>
            <Text style={{fontSize:26,fontWeight:'900',color:theme.ink}}>{Number(summary?.incident||0)}</Text>
            <Text style={{fontSize:11,lineHeight:16,color:theme.muted}}>Bugs, crashes, network failures, data errors, and automatic diagnostics stay in the technical incident queue.</Text>
          </Pressable>
        </Link>
      </View>
    </View>

    <View style={{gap:8}}>
      <SectionHeader title="Filter work" body="Queue filters describe meaning. Status filters describe what you have decided to do with it."/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
        <Pressable onPress={()=>setQueue('all')} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:999,backgroundColor:queue==='all'?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:queue==='all'?theme.accentText:theme.accent}}>ALL FEEDBACK</Text></Pressable>
        {queueOptions.map(item=><Pressable key={item.key} onPress={()=>setQueue(item.key)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:999,backgroundColor:queue===item.key?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',fontSize:10,color:queue===item.key?theme.accentText:theme.accent}}>{item.label}</Text></Pressable>)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7}}>
        {statusOptions.map(item=><Pressable key={item} onPress={()=>setStatus(item)} style={{paddingHorizontal:11,paddingVertical:8,borderRadius:999,backgroundColor:status===item?theme.ink:theme.surfaceRaised}}><Text style={{fontWeight:'900',fontSize:10,color:status===item?'#fff':theme.muted}}>{item.toUpperCase()}</Text></Pressable>)}
      </ScrollView>
    </View>

    <View style={{gap:9}}>
      {rows.map(row=>{
        const sentiment=String(row.metadata?.sentiment||'').replaceAll('_',' ');
        const kind=String(row.metadata?.feedback_kind||row.category||'feedback').replaceAll('_',' ');
        return <View key={row.id} style={{...card,gap:10}}>
          <View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}>
            <View style={{flex:1,gap:3}}>
              <Text style={{fontSize:9,fontWeight:'900',letterSpacing:1,color:theme.accent}}>{queueLabel(row.owner_queue)}</Text>
              <Text style={{fontSize:18,lineHeight:23,fontWeight:'900',color:theme.ink}}>{row.message}</Text>
            </View>
            <StatusPill label={row.owner_status.toUpperCase()} tone={statusTone(row.owner_status)}/>
          </View>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
            <StatusPill label={kind.toUpperCase()} tone={queueTone(row.owner_queue)}/>
            {sentiment?<StatusPill label={sentiment.toUpperCase()} tone={sentiment==='great'?'good':sentiment==='frustrating'?'warning':'neutral'}/>:null}
            <StatusPill label={row.report_kind.toUpperCase()} tone={row.report_kind==='automatic'?'warning':'neutral'}/>
          </View>
          <Text style={{fontSize:12,lineHeight:18,color:theme.muted}}>{row.route||'Unknown screen'} · {when(row.created_at)} · {row.platform||'unknown platform'} · app {row.app_version||'unknown'}</Text>

          <View style={{backgroundColor:theme.surfaceRaised,borderRadius:14,padding:11,gap:5}}>
            <Text style={{fontSize:10,fontWeight:'900',letterSpacing:.8,color:theme.muted}}>ATTACHED CONTEXT</Text>
            <Text selectable style={{fontFamily:'monospace',fontSize:10,lineHeight:15,color:theme.muted}}>{JSON.stringify({runtime:row.runtime_version,update:row.update_id,metadata:row.metadata},null,2)}</Text>
          </View>

          <TextInput
            value={notes[row.id]??''}
            onChangeText={value=>setNotes(current=>({...current,[row.id]:value}))}
            placeholder="Owner note / decision rationale"
            placeholderTextColor={theme.muted}
            multiline
            style={{minHeight:52,borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}
          />

          <View style={{gap:6}}>
            <Text style={{fontSize:9,fontWeight:'900',letterSpacing:.8,color:theme.muted}}>ROUTE AS</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
              {queueOptions.map(option=><Pressable key={option.key} disabled={busy} onPress={()=>void update(row,row.owner_status,option.key)} style={{paddingHorizontal:9,paddingVertical:7,borderRadius:999,backgroundColor:row.owner_queue===option.key?theme.accent:theme.accentSoft}}><Text style={{fontSize:9,fontWeight:'900',color:row.owner_queue===option.key?theme.accentText:theme.accent}}>{option.label}</Text></Pressable>)}
              <Pressable disabled={busy} onPress={()=>void update(row,row.owner_status,'incident')} style={{paddingHorizontal:9,paddingVertical:7,borderRadius:999,backgroundColor:theme.surfaceRaised,borderWidth:1,borderColor:theme.line}}><Text style={{fontSize:9,fontWeight:'900',color:theme.danger}}>INCIDENT</Text></Pressable>
            </View>
          </View>

          <View style={{gap:6}}>
            <Text style={{fontSize:9,fontWeight:'900',letterSpacing:.8,color:theme.muted}}>OWNER DECISION</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
              {actionStatuses.map(next=><Pressable key={next} disabled={busy} onPress={()=>void update(row,next)} style={{paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:row.owner_status===next?theme.accent:theme.surfaceRaised,borderWidth:1,borderColor:theme.line}}><Text style={{fontSize:10,fontWeight:'900',color:row.owner_status===next?theme.accentText:theme.ink}}>{next.toUpperCase()}</Text></Pressable>)}
            </View>
          </View>
        </View>;
      })}
      {!rows.length&&!busy?<View style={card}><Text style={{fontSize:17,fontWeight:'900',color:theme.ink}}>This queue is clear.</Text><Text style={{color:theme.muted,lineHeight:18}}>Tell Kleenest submissions will appear here according to their meaning and owner status.</Text></View>:null}
    </View>
  </ScrollView>;
}
