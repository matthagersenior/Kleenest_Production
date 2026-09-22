import { useEffect,useMemo,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { BarChart,BusinessCard,BusinessHero,SectionHeader,businessColors } from '../components/BusinessOS';
import { getBusinessDashboard,getBusinessGrowth } from '../services/product';
import { currentBusinessId } from '../services/capabilityWorkflows';

type Row=Record<string,any>;
function list(value:any,keys:string[]=[]):Row[]{if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return[]}
function n(value:any){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}

export default function GrowthPerformance(){
 const[businessId,setBusinessId]=useState(''),[data,setData]=useState<any>(null),[dashboard,setDashboard]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading growth performance…');
 async function load(){setBusy(true);try{const id=businessId||await currentBusinessId();setBusinessId(id);const[growth,home]=await Promise.all([getBusinessGrowth(id),getBusinessDashboard(id)]);setData(growth);setDashboard(home);setMessage('')}catch(e:any){setMessage(e?.message||'Growth performance unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const promotions=list(data?.promotions,['promotions','items','rows']);
 const campaigns=list(data?.campaigns,['campaigns','items','rows']);
 const contests=list(data?.contests,['contests','items','rows']);
 const events=list(data?.events,['events','items','rows']);
 const mix=useMemo(()=>[
  {label:'Promotions',value:promotions.length},
  {label:'Campaigns',value:campaigns.length},
  {label:'Contests',value:contests.length},
  {label:'Events',value:events.length},
 ],[promotions.length,campaigns.length,contests.length,events.length]);
 const visits=n(dashboard?.check_ins??dashboard?.checkIns??dashboard?.visits);
 const redemptions=n(dashboard?.redemptions);
 const repeat=n(data?.repeat_visits??data?.repeat_engagement??data?.summary?.repeat_visits);
 const attributed=n(data?.attributed_visits??data?.summary?.attributed_visits);
 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
  <BusinessHero eyebrow="GROWTH PERFORMANCE" title="Measure what your customer programs produce." body="Read-only performance for visits, attributable engagement and active program mix. Create or edit programs in Campaigns & Promotions; build paid placements in Sponsored Ads."/>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  <View style={s.metrics}><Metric label="Visits" value={visits}/><Metric label="Attributed" value={attributed}/><Metric label="Redemptions" value={redemptions}/><Metric label="Repeat engagement" value={repeat}/></View>
  <BarChart title="Program mix" subtitle="Current customer-growth programs by type" items={mix}/>
  <BusinessCard><SectionHeader title="Performance boundary" body="Growth Performance does not create, edit, activate or delete campaigns. That work belongs to Campaigns & Promotions so there is one clear source of truth."/></BusinessCard>
  <ProgramSnapshot title="Campaigns" rows={campaigns}/>
  <ProgramSnapshot title="Promotions" rows={promotions}/>
  <ProgramSnapshot title="Contests" rows={contests}/>
  <ProgramSnapshot title="Events" rows={events}/>
 </ScrollView>
}

function ProgramSnapshot({title,rows}:{title:string;rows:Row[]}){
 const body=rows.length?String(rows.length)+' current '+title.toLowerCase()+' reflected in performance.':'No '+title.toLowerCase()+' are currently reflected.';
 return <View style={s.section}><SectionHeader title={title} body={body}/>{rows.slice(0,8).map((row,index)=><BusinessCard key={String(row.id||index)}><Text style={s.itemTitle}>{String(row.name||row.title||row.label||title.slice(0,-1))}</Text><Text style={s.meta}>{[row.status,row.active===false?'inactive':row.active===true?'active':null].filter(Boolean).join(' · ')||'Current program'}</Text></BusinessCard>)}</View>
}
function Metric({label,value}:{label:string;value:number}){return <View style={s.metric}><Text style={s.metricValue}>{value.toLocaleString()}</Text><Text style={s.meta}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:12,backgroundColor:businessColors.paper,paddingBottom:70},message:{fontWeight:'700',color:'#596b61'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#fff',borderRadius:16,padding:13,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:22,fontWeight:'900',color:businessColors.green},meta:{fontSize:12,lineHeight:18,color:businessColors.muted},section:{gap:8},itemTitle:{fontSize:15,fontWeight:'900',color:businessColors.ink}});
