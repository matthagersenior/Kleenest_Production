import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,SafeAreaView,ScrollView,StyleSheet,Text,View } from 'react-native';
import { getPassportSnapshot,setPassportVisibility } from '../services/passport';
import { useConsumerTheme } from '../services/theme';

const rows=(value:any)=>Array.isArray(value)?value:[];
const num=(value:any)=>Number(value||0);
function dateLabel(value:any){if(!value)return'';const date=new Date(String(value));return Number.isNaN(date.getTime())?'':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function titleCase(value:any){return String(value||'other').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}

export default function PassportScreen(){
  const theme=useConsumerTheme('progress');
  const[data,setData]=useState<any>(null),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
  async function load(){
    setLoading(true);setMessage('');
    try{setData(await getPassportSnapshot())}
    catch(error:any){setMessage(error?.message||'Your Passport could not be loaded.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[]);
  async function toggle(kind:'visit'|'stamp',item:any){
    try{await setPassportVisibility(kind,String(item.id),!item.public_visible);await load();}
    catch(error:any){setMessage(error?.message||'Passport visibility could not be changed.')}
  }
  const summary=data?.summary||{};
  const visits=rows(data?.recent_visits),stamps=rows(data?.achievement_stamps),collections=rows(data?.next_collections);
  const grouped=useMemo(()=>({cities:rows(data?.cities).slice(0,8),states:rows(data?.states).slice(0,8),types:rows(data?.place_types).slice(0,8)}),[data]);

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}>
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} contentContainerStyle={s.content}>
      <View style={[s.hero,{backgroundColor:theme.surfaceRaised,borderColor:theme.accent}]}>
        <Text style={[s.kicker,{color:theme.accent}]}>KLEENEST PASSPORT</Text>
        <Text style={[s.title,{color:theme.ink}]}>Your restroom trail, automatically stamped.</Text>
        <Text style={[s.body,{color:theme.muted}]}>Verified visits, useful evidence and repeat trust quietly build this book. There is nothing extra to check off.</Text>
        <View style={s.metrics}>
          <Metric value={num(summary.places)} label="places" theme={theme}/>
          <Metric value={num(summary.visits)} label="visits" theme={theme}/>
          <Metric value={num(summary.cities)} label="cities" theme={theme}/>
          <Metric value={num(summary.states)} label="states" theme={theme}/>
        </View>
      </View>

      {message?<View style={[s.notice,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.body,{color:theme.muted}]}>{message}</Text></View>:null}

      <Section title="Collection trails" body="Your next Passport milestones advance from normal Kleenest use." theme={theme}/>
      <View style={s.stack}>
        {collections.map((item:any)=>{
          const current=num(item.current),target=Math.max(1,num(item.target)),pct=Math.min(100,Math.round((current/target)*100));
          return <View key={String(item.code)} style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
            <View style={s.row}><Text style={[s.cardTitle,{color:theme.ink,flex:1}]}>{item.name}</Text><Text style={[s.counter,{color:theme.accent}]}>{Math.min(current,target)}/{target}</Text></View>
            <View style={[s.track,{backgroundColor:theme.surfaceRaised}]}><View style={[s.fill,{backgroundColor:theme.accent,width:(String(pct)+'%') as any}]}/></View>
          </View>;
        })}
      </View>

      <Section title="Achievement stamps" body="These mark the contributions and patterns that make your Passport distinct." theme={theme}/>
      {stamps.length?<View style={s.stampGrid}>{stamps.map((stamp:any)=><View key={String(stamp.id)} style={[s.stamp,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <View style={[s.stampIcon,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={s.stampEmoji}>{stamp.icon||'✦'}</Text></View>
        <Text style={[s.cardTitle,{color:theme.ink}]}>{stamp.name}</Text>
        <Text style={[s.meta,{color:theme.muted}]}>{titleCase(stamp.category)} · {dateLabel(stamp.earned_at)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={stamp.public_visible?'Hide stamp from public profile':'Show stamp on public profile'} onPress={()=>void toggle('stamp',stamp)} style={[s.visibility,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
          <Text style={[s.visibilityText,{color:theme.accent}]}>{stamp.public_visible?'PUBLIC':'PRIVATE'}</Text>
        </Pressable>
      </View>)}</View>:<Empty text="Your first verified visit starts the achievement book." theme={theme}/>}

      <Section title="Place stamps" body="One stamp per place, with repeat visits accumulated instead of cluttering the book." theme={theme}/>
      {visits.length?<View style={s.stack}>{visits.map((visit:any)=><View key={String(visit.id)} style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <View style={s.row}><View style={{flex:1}}><Text style={[s.cardTitle,{color:theme.ink}]}>{visit.name}</Text><Text style={[s.bodySmall,{color:theme.muted}]}>{[visit.city,visit.state].filter(Boolean).join(', ')||'Location verified with Kleenest'}</Text></View><View style={[s.visitBadge,{backgroundColor:theme.accentSoft}]}><Text style={[s.visitBadgeText,{color:theme.accent}]}>{num(visit.visit_count)}×</Text></View></View>
        <View style={s.detailRow}><Text style={[s.meta,{color:theme.muted}]}>Last stamp {dateLabel(visit.last_visited_at)}</Text><Text style={[s.meta,{color:theme.muted}]}>{titleCase(visit.verification_method)}</Text>{num(visit.points_earned)>0?<Text style={[s.meta,{color:theme.muted}]}>{num(visit.points_earned)} pts</Text>:null}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={visit.public_visible?'Hide place stamp from public profile':'Show place stamp on public profile'} onPress={()=>void toggle('visit',visit)} style={[s.visibility,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,alignSelf:'flex-start'}]}>
          <Text style={[s.visibilityText,{color:theme.accent}]}>{visit.public_visible?'PUBLIC':'PRIVATE'}</Text>
        </Pressable>
      </View>)}</View>:<Empty text="Check in at a restroom and your first place stamp will appear here automatically." theme={theme}/>}

      <Section title="Your map in numbers" body="Passport collections organize the places you have actually verified." theme={theme}/>
      <View style={s.summaryGrid}>
        <SummaryList title="Cities" items={grouped.cities} label={(x:any)=>x.name} value={(x:any)=>String(num(x.places))+' places'} theme={theme}/>
        <SummaryList title="States" items={grouped.states} label={(x:any)=>x.name} value={(x:any)=>String(num(x.places))+' places'} theme={theme}/>
        <SummaryList title="Place types" items={grouped.types} label={(x:any)=>titleCase(x.name)} value={(x:any)=>String(num(x.places))+' places'} theme={theme}/>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Metric({value,label,theme}:{value:any;label:string;theme:any}){return <View style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.metricValue,{color:theme.ink}]}>{value}</Text><Text style={[s.meta,{color:theme.muted}]}>{label}</Text></View>;}
function Section({title,body,theme}:{title:string;body:string;theme:any}){return <View style={{gap:3}}><Text style={[s.sectionTitle,{color:theme.ink}]}>{title}</Text><Text style={[s.body,{color:theme.muted}]}>{body}</Text></View>;}
function Empty({text,theme}:{text:string;theme:any}){return <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.body,{color:theme.muted}]}>{text}</Text></View>;}
function SummaryList({title,items,label,value,theme}:{title:string;items:any[];label:(x:any)=>string;value:(x:any)=>string;theme:any}){return <View style={[s.summaryCard,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.cardTitle,{color:theme.ink}]}>{title}</Text>{items.length?items.map((item:any,index:number)=><View key={label(item)+index} style={s.row}><Text style={[s.bodySmall,{color:theme.ink,flex:1}]}>{label(item)}</Text><Text style={[s.meta,{color:theme.muted}]}>{value(item)}</Text></View>):<Text style={[s.meta,{color:theme.muted}]}>No stamps yet</Text>}</View>;}

const s=StyleSheet.create({
 safe:{flex:1},content:{padding:16,paddingBottom:120,gap:14},hero:{borderWidth:1,borderRadius:24,padding:18,gap:8},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.5},title:{fontSize:28,lineHeight:33,fontWeight:'900'},body:{fontSize:14,lineHeight:20},bodySmall:{fontSize:13,lineHeight:18,fontWeight:'700'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},metric:{flexGrow:1,minWidth:'22%',borderWidth:1,borderRadius:15,padding:11},metricValue:{fontSize:21,fontWeight:'900'},meta:{fontSize:11,fontWeight:'800'},sectionTitle:{fontSize:20,fontWeight:'900'},stack:{gap:8},card:{borderWidth:1,borderRadius:18,padding:14,gap:8},cardTitle:{fontSize:16,fontWeight:'900'},row:{flexDirection:'row',alignItems:'center',gap:9},counter:{fontSize:14,fontWeight:'900'},track:{height:8,borderRadius:999,overflow:'hidden'},fill:{height:'100%',borderRadius:999},stampGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},stamp:{width:'48%',minWidth:150,flexGrow:1,borderWidth:1,borderRadius:18,padding:13,gap:6},stampIcon:{width:46,height:46,borderRadius:23,borderWidth:1,alignItems:'center',justifyContent:'center'},stampEmoji:{fontSize:23},visibility:{borderWidth:1,borderRadius:999,paddingHorizontal:9,paddingVertical:6,alignSelf:'flex-start'},visibilityText:{fontSize:9,fontWeight:'900',letterSpacing:.7},visitBadge:{minWidth:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},visitBadgeText:{fontWeight:'900',fontSize:14},detailRow:{flexDirection:'row',flexWrap:'wrap',gap:10},summaryGrid:{gap:8},summaryCard:{borderWidth:1,borderRadius:18,padding:14,gap:8},notice:{borderWidth:1,borderRadius:14,padding:12}
});
