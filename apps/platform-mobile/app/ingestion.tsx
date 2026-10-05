import { useCallback,useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,Text,View } from 'react-native';
import { DiagnosticDisclosure,HealthCard,OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { getOwnerIngestionControl,repairStalledIngestion,runBoundedIngestionCycle,setCoverageMarketEnabled,setGlobalIngestionPaused,setIngestionSourceEnabled } from '../services/ownerIngestion';
import { usePlatformTheme } from '../services/theme';

type Row=Record<string,unknown>;
const SOURCE_LABELS:Record<string,string>={overture:'Overture Places',data_gov:'Government & civic data'};
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(item=>item&&typeof item==='object') as Row[]:[];
const bool=(value:unknown)=>value===true||value==='true';
const num=(value:unknown)=>{const parsed=Number(value??0);return Number.isFinite(parsed)?parsed:0};
const txt=(value:unknown)=>value==null?'':String(value);
const pct=(value:unknown)=>`${Math.round(num(value)*100)}%`;

function Action({label,onPress,disabled=false,danger=false}:{label:string;onPress:()=>void;disabled?:boolean;danger?:boolean}){
  const theme=usePlatformTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{alignSelf:'flex-start',borderRadius:12,paddingHorizontal:13,paddingVertical:10,backgroundColor:danger?theme.danger:theme.accent,opacity:disabled?0.5:1}}><Text style={{color:theme.accentText,fontWeight:'900'}}>{label}</Text></Pressable>;
}

export default function IngestionControl(){
  const theme=usePlatformTheme(),card=useOSCardStyle();
  const[data,setData]=useState<any>(null),[busy,setBusy]=useState(''),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const load=useCallback(async()=>{setError('');setData(await getOwnerIngestionControl())},[]);
  useEffect(()=>{void load().catch(cause=>setError(cause instanceof Error?cause.message:String(cause)))},[load]);
  async function refresh(){setRefreshing(true);try{await load()}catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setRefreshing(false)}}
  async function act(key:string,fn:()=>Promise<unknown>){setBusy(key);setError('');try{await fn();await load()}catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy('')}}

  const status=object(data?.status),storage=object(data?.storage_guard??status.storage_guard),marketStatus=object(status.markets);
  const sources=rows(data?.sources),markets=rows(data?.markets),history=rows(data?.history),discoverySignals=rows(data?.discovery_signals);
  const paused=bool(storage.paused);
  const currentSources=useMemo(()=>sources.filter(row=>Object.prototype.hasOwnProperty.call(SOURCE_LABELS,txt(row.source_key))),[sources]);
  const sourceByKey=useMemo(()=>Object.fromEntries(currentSources.map(row=>[txt(row.source_key),row])),[currentSources]);
  const coverageEnabled=bool(sourceByKey.overture?.enabled),enrichmentEnabled=bool(sourceByKey.data_gov?.enabled);
  const visibleMarkets=useMemo(()=>markets.filter(row=>txt(row.status)!=='complete').slice(0,12),[markets]);
  const running=num(marketStatus.running),pending=num(marketStatus.pending),failed=num(marketStatus.failed),completed=num(marketStatus.completed??marketStatus.complete);

  return <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={{padding:16,gap:16,paddingBottom:84,backgroundColor:theme.canvas}}>
    <OSHero eyebrow="KLEENESTOS · INGESTION" title="Ingestion Control" body="One control surface for Discovery, coverage expansion, refresh and verification, and corrections and enrichment. Retired implementation generations stay out of daily operations.">
      <StatusPill label={paused?'BACKGROUND INGESTION PAUSED':'BACKGROUND INGESTION RUNNING'} tone={paused?'warning':'good'}/>
    </OSHero>

    {error?<View style={{...card,borderColor:theme.danger}}><Text style={{color:theme.danger,fontWeight:'900'}}>Control action failed</Text><Text selectable style={{color:theme.danger}}>{error}</Text></View>:null}

    <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
      <HealthCard label="Global" value={paused?'Paused':'Running'} tone={paused?'warning':'good'} detail={paused?txt(storage.pause_reason)||'Owner/storage guard pause':'Capacity guard protects interactive Discovery'}/>
      <HealthCard label="Coverage" value={coverageEnabled?'Ready':'Off'} tone={coverageEnabled?'good':'warning'} detail="Overture-backed expansion"/>
      <HealthCard label="Markets" value={running+pending} tone={failed?'warning':'neutral'} detail={`${running} running · ${pending} queued · ${completed} complete`}/>
      <HealthCard label="Storage guard" value={pct(storage.pause_fraction)} tone={paused?'warning':'neutral'} detail={`Hard stop ${pct(storage.hard_stop_fraction)}`}/>
    </View>

    <View style={card}>
      <SectionHeader title="Master controls" body="Background work can be paused without disabling interactive Discovery. Manual cycles remain bounded by the existing scheduler and storage safeguards."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <Action label={busy==='global'?'Working…':paused?'Resume background ingestion':'Pause background ingestion'} danger={!paused} disabled={Boolean(busy)} onPress={()=>void act('global',()=>setGlobalIngestionPaused(!paused))}/>
        <Action label={busy==='cycle'?'Starting…':'Run one bounded cycle'} disabled={Boolean(busy)||paused} onPress={()=>void act('cycle',runBoundedIngestionCycle)}/>
        <Action label={busy==='repair'?'Repairing…':'Repair stalled cells'} disabled={Boolean(busy)} onPress={()=>void act('repair',repairStalledIngestion)}/>
      </View>
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Four ingestion lanes" body="Operate by purpose instead of old function and version names."/>
      <View style={card}><StatusPill label="DISCOVERY" tone="good"/><Text style={{fontSize:17,fontWeight:'900',color:theme.ink}}>Interactive discovery</Text><Text style={{color:theme.muted,lineHeight:19}}>Search reads canonical places first and can queue bounded hydration for low-coverage areas.</Text></View>
      <View style={card}><StatusPill label="COVERAGE EXPANSION" tone={coverageEnabled&&!paused?'good':'warning'}/><Text style={{fontSize:17,fontWeight:'900',color:theme.ink}}>Fill geographic gaps</Text><Text style={{color:theme.muted,lineHeight:19}}>Overture-backed expansion works through prioritized markets and spare-capacity safeguards.</Text></View>
      <View style={card}><StatusPill label="REFRESH & VERIFY" tone={failed?'warning':'good'}/><Text style={{fontSize:17,fontWeight:'900',color:theme.ink}}>Keep canonical places healthy</Text><Text style={{color:theme.muted,lineHeight:19}}>Repair stalled work and preserve canonical identity so refreshes strengthen an existing place instead of adding another pin.</Text></View>
      <View style={card}><StatusPill label="CORRECTIONS & ENRICHMENT" tone={enrichmentEnabled?'good':'neutral'}/><Text style={{fontSize:17,fontWeight:'900',color:theme.ink}}>Improve what already exists</Text><Text style={{color:theme.muted,lineHeight:19}}>Civic feeds and trusted observations add evidence, amenities and corrections without becoming a second map truth.</Text></View>
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Discovery growth signals" body="Unexpected territory found by real Kleenest use. Repeated activity promotes an area from observed to emerging to an ingestion candidate; meaningful promotions also notify KleenestOS."/>
      {discoverySignals.length?discoverySignals.slice(0,8).map(row=>{const stage=txt(row.stage)||'observed',events=num(row.event_count),places=num(row.discovered_count),users=num(row.distinct_users),lat=num(row.latitude),lng=num(row.longitude);return <View key={txt(row.cell_key)} style={card}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}><View style={{flex:1,gap:3}}><Text style={{fontSize:16,fontWeight:'900',color:theme.ink}}>Unexpected Discovery near {lat.toFixed(1)}, {lng.toFixed(1)}</Text><Text style={{color:theme.muted}}>{events} Discovery event{events===1?'':'s'} · {places} places found · {users} user{users===1?'':'s'}</Text></View><StatusPill label={stage.replaceAll('_',' ').toUpperCase()} tone={stage==='ingestion_candidate'?'good':stage==='emerging'?'warning':'neutral'}/></View>
        <Text style={{color:theme.muted,lineHeight:19}}>Sources: {Array.isArray(row.sources)?row.sources.map(txt).filter(Boolean).join(', ')||'not reported':'not reported'} · Last seen {txt(row.last_seen_at)||'recently'}</Text>
      </View>}):<View style={card}><Text style={{color:theme.muted}}>No unexpected Discovery territory has crossed the signal threshold yet. Background ingestion is covering expected demand.</Text></View>}
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Current data sources" body="Only current ingestion authorities are shown. Retired versioned channels remain implementation history, not Owner controls."/>
      {currentSources.map(row=>{const key=txt(row.source_key),enabled=bool(row.enabled),actionKey=`source:${key}`;return <View key={key} style={card}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}><View style={{flex:1,gap:3}}><Text style={{fontSize:16,fontWeight:'900',color:theme.ink}}>{SOURCE_LABELS[key]??key}</Text><Text style={{color:theme.muted}}>Priority {num(row.priority)} · {txt(row.quota_mode)||'managed'} · max {num(row.max_requests_per_cycle)||1}/cycle</Text></View><StatusPill label={enabled?'ON':'OFF'} tone={enabled?'good':'neutral'}/></View>
        <Action label={busy===actionKey?'Working…':enabled?'Pause source':'Enable source'} danger={enabled} disabled={Boolean(busy)} onPress={()=>void act(actionKey,()=>setIngestionSourceEnabled(key,!enabled))}/>
      </View>})}
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Coverage priorities" body="Top incomplete markets. Completed markets and old source-channel details stay out of the daily view."/>
      {visibleMarkets.length?visibleMarkets.map(row=>{const id=txt(row.id),name=txt(row.name)||txt(row.market_key),state=txt(row.state_code),stateText=txt(row.status)||'pending',enabled=stateText!=='blocked',priority=Math.max(1,num(row.priority)||100),actionKey=`market:${id}`;return <View key={id} style={card}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}}><View style={{flex:1,gap:3}}><Text style={{fontSize:16,fontWeight:'900',color:theme.ink}}>{name}{state?`, ${state}`:''}</Text><Text style={{color:theme.muted}}>Priority {priority} · {stateText}{row.current_source?` · ${txt(row.current_source)}`:''}</Text></View><StatusPill label={enabled?stateText.toUpperCase():'PAUSED'} tone={stateText==='failed'?'danger':stateText==='running'?'good':enabled?'neutral':'warning'}/></View>
        <Pressable accessibilityRole="button" disabled={Boolean(busy)||stateText==='running'} onPress={()=>void act(actionKey,()=>setCoverageMarketEnabled({marketId:id,priority,enabled:!enabled,name}))} style={{alignSelf:'flex-start',paddingVertical:8,paddingHorizontal:11,borderRadius:10,borderWidth:1,borderColor:theme.line,opacity:busy||stateText==='running'?0.5:1}}><Text style={{fontWeight:'900',color:theme.accent}}>{busy===actionKey?'Working…':enabled?'Pause priority':'Resume priority'}</Text></Pressable>
      </View>}):<View style={card}><Text style={{color:theme.muted}}>No incomplete coverage priorities are waiting.</Text></View>}
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Audit & diagnostics" body="Raw state remains available when needed without dominating the Owner experience."/>
      <DiagnosticDisclosure title="ingestion control snapshot" value={data}/>
      <DiagnosticDisclosure title="recent ingestion control history" value={history}/>
    </View>
  </ScrollView>;
}
