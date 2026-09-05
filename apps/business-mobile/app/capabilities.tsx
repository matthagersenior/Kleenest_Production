import { Link } from 'expo-router';
import { useEffect,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { getBusinessCapabilityState } from '../services/control';

function rows(value:any):any[]{
  if(Array.isArray(value))return value;
  if(Array.isArray(value?.capabilities))return value.capabilities;
  if(value&&typeof value==='object')return Object.entries(value).map(([key,val])=>({key,value:val}));
  return [];
}

export default function Capabilities(){
  const[data,setData]=useState<any>(null);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('Loading capability contract…');

  async function load(){
    setBusy(true);
    try{
      const id=await currentBusinessId();
      const next=await getBusinessCapabilityState(id);
      setData(next);
      setMessage(next.partial?'Some capability evidence is temporarily unavailable.':'');
    }catch(e:any){
      setMessage(e?.message||'Business capabilities are unavailable.');
    }finally{
      setBusy(false);
    }
  }

  useEffect(()=>{void load()},[]);
  const matrix=rows(data?.matrix);
  const enabled=matrix.filter(row=>row.enabled===true||row.allowed===true||row.value===true).length;

  return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
    <View style={s.hero}>
      <Text style={s.kicker}>CAPABILITY CONTROL PLANE</Text>
      <Text style={s.title}>Plan × role × workspace.</Text>
      <Text style={s.body}>Purchased entitlements decide what the organization has. Your Business role decides what you may operate. Supabase remains authoritative for every mutation.</Text>
      <View style={s.links}>
        <Link href="/workspaces" style={s.link}>Workspace</Link>
        <Link href="/members" style={s.link}>People & roles</Link>
        <Link href="/profile" style={s.link}>Business profile</Link>
        <Link href="/enterprise" style={s.link}>Enterprise</Link>
      </View>
    </View>
    {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
    <View style={s.metrics}><Metric label="Capability entries" value={matrix.length}/><Metric label="Enabled" value={enabled}/></View>
    <View style={s.card}><Text style={s.cardTitle}>Qualification</Text><Text style={s.meta}>{qualificationText(data?.qualification)}</Text></View>
    <Text style={s.section}>Effective capabilities</Text>
    {matrix.map((row,index)=>{
      const name=String(row.capability||row.code||row.key||row.name||`Capability ${index+1}`);
      const value=row.enabled??row.allowed??row.granted??row.value;
      return <View key={`${name}-${index}`} style={s.cap}>
        <View style={{flex:1}}><Text style={s.capTitle}>{name.replaceAll('_',' ')}</Text><Text style={s.meta}>{String(row.description||row.reason||row.plan||row.tier||'Canonical Business capability')}</Text></View>
        <View style={[s.pill,value===false&&s.pillOff]}><Text style={[s.pillText,value===false&&s.pillTextOff]}>{value===false?'LOCKED':value===true?'ACTIVE':'INFO'}</Text></View>
      </View>;
    })}
  </ScrollView>;
}

function qualificationText(value:any){
  if(!value)return 'No qualification details were returned for this workspace.';
  if(Array.isArray(value))return value.map(row=>String(row.message||row.reason||row.status||row.name||'')).filter(Boolean).join(' · ')||`${value.length} qualification records`;
  if(typeof value==='object')return [value.plan,value.tier,value.status,value.reason,value.message].filter(Boolean).join(' · ')||'Qualification evidence is available.';
  return String(value);
}
function Metric({label,value}:{label:string;value:number}){return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.meta}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:10,backgroundColor:'#f3f6f4',paddingBottom:60},hero:{backgroundColor:'#173f2d',borderRadius:24,padding:20,gap:8},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},title:{fontSize:28,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#deebe4'},links:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:4},link:{backgroundColor:'#edf3ef',color:'#173f2d',fontWeight:'900',paddingHorizontal:10,paddingVertical:8,borderRadius:999},message:{fontWeight:'700',color:'#596b61'},metrics:{flexDirection:'row',gap:8,flexWrap:'wrap'},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#fff',borderRadius:16,padding:13,borderWidth:1,borderColor:'#dbe5de'},metricValue:{fontSize:22,fontWeight:'900',color:'#173f2d'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},card:{backgroundColor:'#fff',borderRadius:18,padding:15,gap:7,borderWidth:1,borderColor:'#dbe5de'},cardTitle:{fontSize:17,fontWeight:'900',color:'#102218'},section:{fontSize:21,fontWeight:'900',color:'#102218',marginTop:4},cap:{backgroundColor:'#fff',borderRadius:16,padding:13,borderWidth:1,borderColor:'#dbe5de',flexDirection:'row',gap:9,alignItems:'center'},capTitle:{fontSize:15,fontWeight:'900',color:'#102218'},pill:{backgroundColor:'#e7f2eb',paddingHorizontal:9,paddingVertical:6,borderRadius:999},pillOff:{backgroundColor:'#f6eaea'},pillText:{fontSize:10,fontWeight:'900',color:'#21613d'},pillTextOff:{color:'#8b3434'}});
