import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePlatformTheme } from '../services/theme';
import {
  classifyOwnerLocationDuplicate, getOwnerDuplicateCounts, listDuplicateReviewHistory,
  listOwnerLocationDuplicates, type DuplicateCase, type DuplicateLocation, type DuplicateReviewCursor,
  type DuplicateReviewEvent, type DuplicateStatus,
} from '../services/locationDedup';
import { analyzeDuplicateCase, type ReviewDifference } from '../services/locationDuplicateInsights';

const PAGE_SIZE=40;
const lanes:{key:DuplicateStatus;label:string}[]=[
  {key:'pending',label:'Likely matches'},
  {key:'needs_geocoding',label:'Wrong map pins'},
  {key:'confirmed',label:'Confirmed'},
  {key:'co_located',label:'Shared buildings'},
  {key:'different_businesses',label:'Separate'},
  {key:'resolved',label:'Closed'},
];
const actionLabel:Record<DuplicateStatus,string>={
  pending:'Reopen for review',
  needs_geocoding:'Needs coordinate correction',
  confirmed:'Confirm same business',
  co_located:'Two businesses, shared building',
  different_businesses:'Keep separate businesses',
  resolved:'Close case',
};
function metres(value:number|null) {
  if(value==null)return 'Distance unknown';
  return value<1000?`${Math.round(value)} m apart`:`${(value/1000).toFixed(1)} km apart`;
}
function address(record?:DuplicateLocation) {
  if(!record)return 'Location missing';
  return [record.address,record.city,record.state,record.postal_code].filter(Boolean).join(', ')||'No address recorded';
}

function LocationCard({record,side}:{record?:DuplicateLocation;side:string}) {
  const theme=usePlatformTheme();
  async function showMap() {
    if(record?.latitude==null||record.longitude==null)return;
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${record.latitude},${record.longitude}`)}`);
  }
  const canMap=record?.latitude!=null&&record?.longitude!=null;
  return <View style={[s.location,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[s.kicker,{color:theme.muted}]}>{side}</Text>
    <Text style={[s.name,{color:theme.ink}]}>{record?.name||'Unresolved location ID'}</Text>
    <Text style={[s.detail,{color:theme.ink}]}>{address(record)}</Text>
    <Text style={[s.detail,{color:theme.muted}]}>{record?.place_type||'Unknown category'} · {record?.source_dataset||'Unknown dataset'}</Text>
    {canMap?<Pressable accessibilityRole="link" onPress={()=>void showMap()}>
      <Text style={[s.link,{color:theme.accent}]}>View map pin · {Number(record?.latitude).toFixed(5)}, {Number(record?.longitude).toFixed(5)}</Text>
    </Pressable>:null}
    {record?.is_active===false?<Text style={[s.detail,{color:theme.success}]}>Archived source alias (not in Explore)</Text>:null}
  </View>;
}

function DiffRow({item}:{item:ReviewDifference}){
  const theme=usePlatformTheme();
  const critical=item.kind==='conflict';
  const tone=critical?theme.danger:theme.muted;
  const label=item.kind==='variant'?'Formatting variation':
    item.kind==='missing'?'Missing field':
    item.kind==='context'?'Different data sources':'Conflicting data';
  return <View style={[s.diff,{backgroundColor:theme.surfaceRaised,borderColor:critical?theme.danger:theme.line}]}>
    <View style={s.diffHead}>
      <Text style={[s.diffTitle,{color:theme.ink}]}>{item.field}</Text>
      <Text style={[s.diffType,{color:tone}]}>{label}</Text>
    </View>
    <View style={s.compare}><Text style={[s.compareText,{color:theme.ink}]}>A: {item.first}</Text>
      <Text style={[s.compareText,{color:theme.ink}]}>B: {item.second}</Text></View>
  </View>;
}

export default function LocationDuplicates(){
  const theme=usePlatformTheme();
  const router=useRouter();
  const [status,setStatus]=useState<DuplicateStatus>('pending');
  const [page,setPage]=useState(0);
  const [cursor,setCursor]=useState<DuplicateReviewCursor|null>(null);
  const [cursorHistory,setCursorHistory]=useState<(DuplicateReviewCursor|null)[]>([]);
  const [reachedEnd,setReachedEnd]=useState(false);
  const [index,setIndex]=useState(0);
  const [rows,setRows]=useState<DuplicateCase[]>([]);
  const [counts,setCounts]=useState<Partial<Record<DuplicateStatus,number>>>({});
  const [busy,setBusy]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [notes,setNotes]=useState('');
  const [proposed,setProposed]=useState<DuplicateStatus|null>(null);
  const [history,setHistory]=useState<DuplicateReviewEvent[]|null>(null);
  const [historyBusy,setHistoryBusy]=useState(false);
  const latestRequest=useRef(0);
  const pageEnd=useRef<DuplicateReviewCursor|null>(null);
  const pageWasFull=useRef(false);
  const item=rows[index];
  const insight=useMemo(()=>item?analyzeDuplicateCase(item):null,[item]);
  const allTotal=lanes.reduce((sum,lane)=>sum+(counts[lane.key]||0),0);
  const waiting=(counts.pending||0)+(counts.needs_geocoding||0);
  const handled=allTotal-waiting;
  const percent=allTotal?Math.round(handled*100/allTotal):0;
  const laneTotal=counts[status]||0;

  async function load(nextStatus:DuplicateStatus=status,nextCursor:DuplicateReviewCursor|null=cursor){
    const request=++latestRequest.current;
    setBusy(true);setError('');
    try{
      const [cases,nextCounts]=await Promise.all([
        listOwnerLocationDuplicates(nextStatus,nextCursor,PAGE_SIZE),
        getOwnerDuplicateCounts(),
      ]);
      if(request!==latestRequest.current)return;
      setRows(cases);setCounts(nextCounts);setIndex(0);setReachedEnd(false);
      pageEnd.current=cases.length?cases[cases.length-1]:null;
      pageWasFull.current=cases.length===PAGE_SIZE;
    }catch(e:unknown){
      if(request!==latestRequest.current)return;
      setRows([]);setError(e instanceof Error?e.message:'Unable to load duplicate cases');
    }finally{if(request===latestRequest.current)setBusy(false);}
  }
  useEffect(()=>{void load(status,cursor);},[status,cursor]);
  useEffect(()=>{
    setNotes(item?.review_notes||'');
    setProposed(null);
    setHistory(null);
  },[item?.id]);

  function selectLane(next:DuplicateStatus){
    setMessage('');setError('');setIndex(0);setPage(0);setCursorHistory([]);
    setCursor(null);setReachedEnd(false);setStatus(next);
    if(next===status&&cursor===null)void load(next,null);
  }
  function nextBatch(){
    if(pageWasFull.current&&pageEnd.current){
      setCursorHistory(old=>[...old,cursor]);
      setCursor(pageEnd.current);setPage(n=>n+1);setIndex(0);
    }else{
      setRows([]);setReachedEnd(true);
    }
  }
  function advance(){
    setMessage('');setError('');
    if(index<rows.length-1)setIndex(index+1);
    else nextBatch();
  }
  function previous(){
    setMessage('');setError('');
    if(index>0){setIndex(index-1);return;}
    if(cursorHistory.length>0){
      setCursor(cursorHistory[cursorHistory.length-1]);
      setCursorHistory(old=>old.slice(0,-1));setPage(n=>Math.max(0,n-1));
      setReachedEnd(false);
    }
  }
  async function saveDecision(){
    if(!item||!proposed||saving)return;
    setSaving(true);setError('');
    try{
      await classifyOwnerLocationDuplicate(item,proposed,notes);
      setMessage(`Case #${item.id}: ${actionLabel[proposed]}. Decision logged; no business records merged.`);
      setProposed(null);
      // Keep this batch in its original ordering. Re-fetching an offset
      // window after deletion could re-show skipped rows and skip unseen rows.
      if(rows.length===1)nextBatch();
      else {
        setRows(current=>current.filter(candidate=>candidate.id!==item.id));
        setIndex(current=>Math.min(current,rows.length-2));
      }
      setCounts(await getOwnerDuplicateCounts());
    }catch(e:unknown){
      setError(e instanceof Error?e.message:'Unable to save review');
    }finally{setSaving(false);}
  }
  async function showHistory(){
    if(!item)return;
    if(history){setHistory(null);return;}
    setHistoryBusy(true);setError('');
    try{setHistory(await listDuplicateReviewHistory(item.id));}
    catch(e:unknown){setError(e instanceof Error?e.message:'Unable to read review history');}
    finally{setHistoryBusy(false);}
  }

  return <ScrollView style={{backgroundColor:theme.canvas}}
    refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load(status,cursor)}/>}
    contentContainerStyle={s.page}>
    <View style={[s.hero,{backgroundColor:theme.accent}]}>
      <Text style={[s.kicker,{color:theme.accentText}]}>KLEENESTOS · DATA INTEGRITY</Text>
      <Text style={[s.heading,{color:theme.accentText}]}>Duplicate review</Text>
      <Text style={[s.heroText,{color:theme.accentText}]}>One case at a time. See inconsistencies, review evidence, and keep real businesses separate.</Text>
    </View>
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <View style={s.diffHead}><Text style={[s.headingSmall,{color:theme.ink}]}>Review progress</Text>
        <Text style={[s.count,{color:theme.accent}]}>{percent}%</Text></View>
      <View style={[s.track,{backgroundColor:theme.surfaceRaised}]}>
        <View style={[s.progress,{backgroundColor:theme.success,width:`${percent}%` as `${number}%`}]}/>
      </View>
      <Text style={[s.detail,{color:theme.muted}]}>{handled.toLocaleString()} reviewed or classified · {waiting.toLocaleString()} awaiting decisions · {allTotal.toLocaleString()} total cases</Text>
    </View>
    <View style={s.tabs}>{lanes.map(lane=><Pressable key={lane.key} accessibilityRole="button"
      onPress={()=>selectLane(lane.key)} style={[s.tab,{borderColor:lane.key===status?theme.accent:theme.line,backgroundColor:lane.key===status?theme.accent:theme.surface}]}>
      <Text style={{color:lane.key===status?theme.accentText:theme.ink,fontSize:12,fontWeight:'800'}}>{lane.label} ({counts[lane.key]??'…'})</Text>
    </Pressable>)}</View>
    <Text style={[s.detail,{color:theme.muted}]}>
      {status==='pending'?'Prioritized by match confidence: review the clearest possible duplicates first.':
      status==='needs_geocoding'?'Prioritized by largest pin discrepancy: check the real building or entrance before confirming identity.':
      'Read prior decisions and reopen anything that requires correction.'}
    </Text>
    {message?<Text style={[s.statusLine,{color:theme.success}]}>{message}</Text>:null}
    {error?<Text style={[s.statusLine,{color:theme.danger}]}>{error}</Text>:null}
    {busy?<ActivityIndicator size="large" color={theme.accent}/>:null}
    {!busy&&item&&insight?<View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <View style={s.diffHead}>
        <Text style={[s.headingSmall,{color:theme.ink}]}>Case #{item.id}</Text>
        <Text style={[s.count,{color:theme.muted}]}>Batch {page+1} · {index+1} of {rows.length} · {laneTotal.toLocaleString()} remaining in lane</Text>
      </View>
      <Text style={[s.detail,{color:theme.muted}]}>{metres(item.distance_m)} · Rule match {Math.round(Number(item.confidence)*100)}% (not a verified probability)</Text>
      {(item.status==='confirmed'||item.status==='resolved')?<Pressable accessibilityRole="button"
        onPress={()=>router.push({pathname:'/location-consolidate',params:{caseId:String(item.id)}})}
        style={[s.recommendedAction,{backgroundColor:theme.accent}]}>
        <Text style={{color:theme.accentText,fontWeight:'900'}}>
          {item.status==='resolved'?'View consolidation / restore':'Preview verified consolidation →'}
        </Text>
      </Pressable>:null}
      <View style={[s.recommendation,{borderColor:insight.urgency==='urgent'?theme.danger:theme.line,backgroundColor:theme.surfaceRaised}]}>
        <Text style={[s.kicker,{color:insight.urgency==='urgent'?theme.danger:theme.muted}]}>{insight.urgency.toUpperCase()} PRIORITY · SUGGESTED NEXT STEP</Text>
        <Text style={[s.headingSmall,{color:theme.ink}]}>{insight.headline}</Text>
        <Text style={[s.detail,{color:theme.ink}]}>{insight.explanation}</Text>
        {insight.suggestedStatus?<Pressable accessibilityRole="button" disabled={saving}
          onPress={()=>setProposed(insight.suggestedStatus)}
          style={[s.recommendedAction,{backgroundColor:theme.accent}]}>
          <Text style={{color:theme.accentText,fontWeight:'900'}}>{actionLabel[insight.suggestedStatus]} →</Text>
        </Pressable>:null}
      </View>
      <LocationCard record={item.first} side="RECORD A"/>
      <LocationCard record={item.second} side="RECORD B"/>
      <Text style={[s.headingSmall,{color:theme.ink}]}>Highlighted discrepancies ({insight.differences.length})</Text>
      {insight.differences.length?insight.differences.map((difference,i)=>
        <DiffRow key={difference.field+i} item={difference}/>)
        :<Text style={[s.detail,{color:theme.success}]}>No differences in the compared business fields; still verify physical identity.</Text>}
      {insight.supportingSignals.length?<View style={s.signals}>
        <Text style={[s.headingSmall,{color:theme.ink}]}>Supporting evidence</Text>
        {insight.supportingSignals.map(signal=><Text key={signal} style={[s.detail,{color:theme.muted}]}>✓ {signal}</Text>)}
      </View>:null}
      <Text style={[s.headingSmall,{color:theme.ink}]}>Choose a review decision</Text>
      <Text style={[s.detail,{color:theme.muted}]}>Recommendations are based on record comparisons, not verified ground truth. Confirming a duplicate only marks this case; it does not merge locations.</Text>
      <View style={s.actions}>{(['confirmed','co_located','different_businesses','needs_geocoding','resolved'] as DuplicateStatus[])
        .filter(decision=>decision!==item.status).map(decision=>
          <Pressable key={decision} accessibilityRole="button" disabled={saving}
            onPress={()=>setProposed(decision)}
            style={[s.action,{borderColor:proposed===decision?theme.accent:theme.line,
              backgroundColor:proposed===decision?theme.accent:theme.surfaceRaised}]}>
            <Text style={{color:proposed===decision?theme.accentText:theme.ink,fontWeight:'800',fontSize:12}}>{actionLabel[decision]}</Text>
          </Pressable>)}
        {!['pending','needs_geocoding'].includes(item.status)?<Pressable accessibilityRole="button"
          onPress={()=>setProposed('pending')}
          style={[s.action,{borderColor:theme.line,backgroundColor:theme.surfaceRaised}]}>
          <Text style={{color:theme.ink,fontWeight:'800',fontSize:12}}>Reopen</Text>
        </Pressable>:null}
      </View>
      <TextInput accessibilityLabel="Review evidence and notes"
        value={notes} onChangeText={setNotes} multiline
        placeholder="Evidence, corrections or why you chose this action…"
        placeholderTextColor={theme.muted}
        style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
      {proposed?<View style={[s.confirm,{borderColor:theme.accent}]}>
        <Text style={[s.headingSmall,{color:theme.ink}]}>Save decision: {actionLabel[proposed]}?</Text>
        <Text style={[s.detail,{color:theme.muted}]}>This changes the review classification and adds an audit event. Business and location records remain intact.</Text>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" disabled={saving} onPress={()=>void saveDecision()}
            style={[s.recommendedAction,{backgroundColor:theme.accent}]}>
            <Text style={{color:theme.accentText,fontWeight:'900'}}>{saving?'Saving…':'Save and continue'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={()=>setProposed(null)}
            style={[s.action,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
            <Text style={{color:theme.ink,fontWeight:'800'}}>Cancel</Text>
          </Pressable>
        </View>
      </View>:null}
      <Pressable accessibilityRole="button" disabled={historyBusy} onPress={()=>void showHistory()}>
        <Text style={[s.link,{color:theme.accent}]}>{history?'Hide review history':'View audit history'} {historyBusy?'…':''}</Text>
      </Pressable>
      {history?<View style={s.signals}>
        {history.length===0?<Text style={[s.detail,{color:theme.muted}]}>No manual decisions recorded yet.</Text>
        :history.map(e=><Text key={e.id} style={[s.detail,{color:theme.muted}]}>
          {new Date(e.changed_at).toLocaleString()}: {e.previous_status.replaceAll('_',' ')} → {e.next_status.replaceAll('_',' ')}
        </Text>)}
      </View>:null}
    </View>:null}
    {!busy&&!item?<View style={[s.card,{borderColor:theme.line,backgroundColor:theme.surface}]}>
      <Text style={[s.headingSmall,{color:theme.ink}]}>{reachedEnd?'End of this review lane':'No more cases on this page'}</Text>
      <Text style={[s.detail,{color:theme.muted}]}>Open the next batch of remaining cases or choose another review lane.</Text>
      <Pressable accessibilityRole="button" onPress={()=>{setPage(0);setCursorHistory([]);setCursor(null);void load(status,null);}}
        style={[s.recommendedAction,{backgroundColor:theme.accent}]}>
        <Text style={{color:theme.accentText,fontWeight:'900'}}>Return to remaining cases</Text>
      </Pressable>
    </View>:null}
    <View style={s.navigator}>
      <Pressable accessibilityRole="button" disabled={busy||(!cursorHistory.length&&!index)}
        onPress={previous} style={[s.action,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <Text style={{color:theme.ink,fontWeight:'800'}}>← Previous</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy||!item} onPress={advance}
        style={[s.action,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <Text style={{color:theme.ink,fontWeight:'800'}}>Skip / Next →</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

const s=StyleSheet.create({
  page:{padding:16,paddingBottom:80,gap:13},
  hero:{padding:18,borderRadius:20,gap:7},
  kicker:{fontSize:10,fontWeight:'900',letterSpacing:.7},
  heading:{fontSize:26,fontWeight:'900'},
  heroText:{fontSize:13,lineHeight:20},
  headingSmall:{fontSize:16,fontWeight:'900'},
  card:{padding:14,borderRadius:16,borderWidth:1,gap:12},
  tabs:{flexDirection:'row',flexWrap:'wrap',gap:7},
  tab:{paddingVertical:9,paddingHorizontal:11,borderRadius:999,borderWidth:1},
  detail:{fontSize:12,lineHeight:19},
  statusLine:{fontSize:13,fontWeight:'800'},
  count:{fontSize:12,fontWeight:'900'},
  track:{height:8,borderRadius:6,overflow:'hidden'},
  progress:{height:8,borderRadius:6},
  recommendation:{padding:12,borderRadius:12,borderWidth:1,gap:7},
  recommendedAction:{paddingHorizontal:13,paddingVertical:11,borderRadius:10,alignSelf:'flex-start'},
  location:{padding:12,borderWidth:1,borderRadius:12,gap:5},
  name:{fontSize:16,fontWeight:'900'},
  link:{fontSize:12,fontWeight:'800',paddingVertical:5},
  diff:{borderWidth:1,borderRadius:10,padding:10,gap:6},
  diffHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'},
  diffTitle:{fontSize:13,fontWeight:'900'},
  diffType:{fontSize:11,fontWeight:'700'},
  compare:{gap:3},
  compareText:{fontSize:12,lineHeight:18},
  signals:{gap:6},
  actions:{flexDirection:'row',gap:8,flexWrap:'wrap'},
  action:{paddingHorizontal:10,paddingVertical:10,borderWidth:1,borderRadius:10},
  input:{borderWidth:1,borderRadius:10,minHeight:64,padding:10,textAlignVertical:'top',fontSize:13},
  confirm:{borderWidth:2,borderRadius:12,padding:12,gap:9},
  navigator:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
});
