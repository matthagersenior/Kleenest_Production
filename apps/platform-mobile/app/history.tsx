import { useEffect,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { getPlatformDashboard } from '../services/product';

type Row=Record<string,unknown>;

function listRows(value:unknown):Row[]{
 if(Array.isArray(value))return value.filter((item):item is Row=>Boolean(item)&&typeof item==='object'&&!Array.isArray(item));
 if(!value||typeof value!=='object')return[];
 return Object.values(value as Record<string,unknown>).flatMap(item=>Array.isArray(item)?listRows(item):[]);
}
function field(row:Row,keys:string[]){for(const key of keys){const value=row[key];if(typeof value==='string'&&value.trim())return value.trim();if(typeof value==='number'||typeof value==='boolean')return String(value)}return'';}
function label(value:string){return value.replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase());}
function formatTimestamp(value:unknown){if(value===null||value===undefined||value==='')return'';const date=new Date(String(value));return Number.isNaN(date.getTime())?String(value):date.toLocaleString();}

export default function History(){
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading control history…');
 async function load(){setBusy(true);try{setData(await getPlatformDashboard());setMessage('')}catch(e:any){setMessage(e?.message||'Control history unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}><Text style={s.eyebrow}>AUDITED CONTROL PLANE</Text><Text style={s.heroTitle}>Platform history</Text><Text style={s.heroCopy}>Review administrative mutations and recent platform activity as readable operator events instead of raw backend payloads.</Text></View>
  {message?<Text style={s.message}>{message}</Text>:null}
  <Section title="Control history" value={data?.history} emptyText="No control history recorded."/>
  <Section title="Platform activity" value={data?.activity} emptyText="No platform activity recorded."/>
 </ScrollView>;
}

function Section({title,value,emptyText}:{title:string;value:unknown;emptyText:string}){
 const rows=listRows(value);
 return <View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text><Text style={s.count}>{rows.length} events</Text></View>{rows.length?rows.slice(0,100).map((row,index)=><HistoryCard key={field(row,['id','event_id','created_at'])||`${title}:${index}`} row={row}/>):<View style={s.empty}><Text style={s.emptyText}>{emptyText}</Text></View>}</View>;
}

function HistoryCard({row}:{row:Row}){
 const action=field(row,['action','event_type','event','operation','kind','type'])||'Platform event';
 const subject=field(row,['resource','table_name','domain','target_type','entity_type','capability']);
 const status=field(row,['status','result','outcome','resolution']);
 const actor=field(row,['actor_email','admin_email','email','admin_user_id','user_id','actor_id']);
 const detail=field(row,['reason','message','description','issue','note']);
 const timestamp=formatTimestamp(row.created_at??row.occurred_at??row.recorded_at??row.updated_at);
 return <View style={s.card}>
  <View style={s.cardHead}><Text style={s.cardTitle}>{label(action)}</Text>{status?<View style={s.status}><Text style={s.statusText}>{label(status)}</Text></View>:null}</View>
  {subject?<Text style={s.subject}>{label(subject)}</Text>:null}
  {detail?<Text style={s.detail}>{detail}</Text>:null}
  <View style={s.metaRow}>{actor?<Text style={s.meta}>Actor · {actor}</Text>:null}{timestamp?<Text style={s.meta}>{timestamp}</Text>:null}</View>
 </View>;
}

const s=StyleSheet.create({
 page:{padding:18,gap:16,paddingBottom:70,backgroundColor:'#f3f6f4'},
 hero:{backgroundColor:'#102218',padding:18,borderRadius:22,gap:6},
 eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.3,color:'#b9d2c2'},
 heroTitle:{fontSize:28,fontWeight:'900',color:'#fff'},
 heroCopy:{fontSize:14,lineHeight:20,color:'#dce9e1'},
 message:{fontWeight:'800',color:'#355345'},
 section:{gap:8},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},sectionTitle:{fontSize:20,fontWeight:'900',color:'#102218'},count:{fontSize:11,fontWeight:'900',color:'#6d7d74'},
 card:{backgroundColor:'#fff',padding:14,borderRadius:16,gap:6,borderWidth:1,borderColor:'#dbe5de'},cardHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},cardTitle:{flex:1,fontSize:16,fontWeight:'900',color:'#102218'},subject:{fontSize:12,fontWeight:'900',color:'#315c47'},detail:{fontSize:13,lineHeight:19,color:'#53645a'},status:{backgroundColor:'#e3f0e8',paddingHorizontal:8,paddingVertical:4,borderRadius:999},statusText:{fontSize:9,fontWeight:'900',color:'#235038'},metaRow:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},meta:{fontSize:10,color:'#829087'},
 empty:{backgroundColor:'#fff',padding:16,borderRadius:16,borderWidth:1,borderColor:'#dbe5de'},emptyText:{fontSize:13,color:'#66766e'}
});
