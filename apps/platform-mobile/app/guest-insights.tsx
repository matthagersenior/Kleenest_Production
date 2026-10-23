import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { SectionHeader, useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';

type Metric = { event_name:string; events:number };
type MonetizationSnapshot = {
  days:number;
  updated_at:string;
  guest:{sessions:number;visitor_keys:number;install_intents:number;install_successes:number};
  guest_ad_diagnostics:{
    network_request_attempts:number;network_impressions:number;web_missing_config:number;network_no_fills:number;
    sponsored_impressions:number;sponsored_clicks:number;install_upsell_views:number;
    install_upsell_clicks:number;upgrade_intents:number;sessions_with_signals:number;
  };
  native_admob:{requests:number;fills:number;impressions:number;paid_callbacks:number;last_event_at:string|null};
  authenticated_sponsorship:{authenticated_impressions:number;authenticated_clicks:number};
  purchases:{verified_store_purchases:number};
  measurement_note:string;
};
type DiscoveryFunnel = {
  guest_app_sessions:number;
  discovery_sessions:number;
  discovery_result_sessions:number;
  intentional_discovery_sessions:number;
  search_sessions:number;
  filtered_sessions:number;
  place_selected_sessions:number;
  navigation_sessions:number;
  zero_result_sessions:number;
  non_discovery_sessions:number;
  discovery_rate_percent:number;
  intentional_rate_percent:number;
  place_selection_rate_percent:number;
  guest_entry_visitor_ids:number;
  guest_entry_discovery_visitor_ids:number;
  returning_discovery_visitor_ids:number;
};
type Session = {
  session_id:string;
  visitor_label:string;
  started_at:string;
  last_seen_at:string;
  last_action:string;
  event_count:number;
};
type VisitWindow={started_at:string;last_seen_at:string;session_count:number;event_count:number;place_selections:number};
type VisitSummary={
  guest_identifiers:number;recorded_sessions:number;estimated_visits:number;
  returning_identifiers:number;multi_day_identifiers:number;
  relaunch_sessions:number;relaunch_heavy_identifiers:number;engaged_identifiers:number;
};
type Visitor = {
  visit_count?:number;
  relaunch_sessions?:number;
  visit_windows?:VisitWindow[];
  visitor_label:string;
  first_seen_at:string;
  last_seen_at:string;
  session_count:number;
  event_count:number;
  active_days:number;
  place_selections:number;
  navigation_starts:number;
  review_actions:number;
  install_actions:number;
  friction_events:number;
  registration_linked:boolean;
  last_action:string;
  sessions:Session[];
};
type VisitorFilter='all'|'returning'|'multi_day'|'single'|'relaunch'|'friction'|'engaged';
type Event = {
  event_name:string;
  occurred_at:string;
  location_name:string|null;
  context:Record<string,unknown>;
};
type Snapshot = {
  updated_at:string;
  days:number;
  historical_guest_sessions:number;
  tracked_events:number;
  tracked_sessions:number;
  approximate_visitors:number;
  engaged_sessions:number;
  navigation_sessions:number;
  zero_result_sessions:number;
  returning_visitors:number;
  registrations_linked:number;
  acquisition_events:Metric[];
  install_browser_events?:Array<{device_kind:string;browser_kind:string;event_name:string;events:number}>;
  events_by_type:Metric[];
  recent_sessions:Session[];
};
function format(value:unknown){return typeof value==='number'?value.toLocaleString():'Unavailable'}
function readable(name:string){return String(name).replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase())}
function dateTime(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?'Unavailable':date.toLocaleString()}
function journeyContext(context:Record<string,unknown>){
  const lines:string[]=[];
  const searchKind=context.search_kind;
  if(searchKind==='nearby')lines.push('Search: nearby discovery');
  else if(searchKind==='place_or_business')lines.push('Search: place or business');
  else if(searchKind==='address_or_area')lines.push('Search: address or area');
  else if(context.search_present===true)lines.push('Search: text entered (phrase not stored)');
  if(typeof context.area_cell==='string')lines.push(`Approximate search area · ~5 km grid: ${context.area_cell}`);
  if(Array.isArray(context.filters)&&context.filters.length)lines.push(`Filters: ${context.filters.map(String).join(', ')}`);
  if(typeof context.result_count==='number')lines.push(`Results shown: ${format(context.result_count)}`);
  if(typeof context.radius_meters==='number')lines.push(`Search radius: ${(context.radius_meters/1000).toFixed(1)} km`);
  const known=new Set(['search_kind','search_present','area_cell','filters','result_count','radius_meters']);
  for(const [key,value] of Object.entries(context))if(!known.has(key))lines.push(`${readable(key)}: ${String(value)}`);
  return lines;
}
export default function GuestInsights(){
  const theme=usePlatformTheme();
  const card=useOSCardStyle();
  const [days,setDays]=useState<7|30>(7);
  const [data,setData]=useState<Snapshot|null>(null);
  const [discovery,setDiscovery]=useState<DiscoveryFunnel|null>(null);
  const [discoveryError,setDiscoveryError]=useState('');
  const [monetization,setMonetization]=useState<MonetizationSnapshot|null>(null);
  const [monetizationError,setMonetizationError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Session|null>(null);
  const [visitors,setVisitors]=useState<Visitor[]>([]);
  const [visitSummary,setVisitSummary]=useState<VisitSummary|null>(null);
  const [visitSummaryError,setVisitSummaryError]=useState('');
  const [visitorError,setVisitorError]=useState('');
  const [selectedVisitor,setSelectedVisitor]=useState<string|null>(null);
  const [visitorFilter,setVisitorFilter]=useState<VisitorFilter>('all');
  const [visitorSort,setVisitorSort]=useState<'recent'|'frequent'>('recent');
  const [events,setEvents]=useState<Event[]>([]);
  const [detailBusy,setDetailBusy]=useState(false);
  const load=useCallback(async()=>{
    const [snapshot,groups,visitSummaryResult,funnel,monetizationResult]=await Promise.all([
      getKleenestSupabaseClient().rpc('owner_guest_journey_snapshot',{p_days:days}),
      getKleenestSupabaseClient().rpc('owner_guest_visitor_groups',{p_days:days}),
      getKleenestSupabaseClient().rpc('owner_guest_visit_summary',{p_days:days}),
      getKleenestSupabaseClient().rpc('owner_guest_discovery_funnel',{p_days:days}),
      getKleenestSupabaseClient().rpc('owner_guest_monetization_snapshot',{p_days:days}),
    ]);
    const {data:response,error:rpcError}=snapshot;
    if(rpcError)throw rpcError;
    if(!response || typeof response.tracked_events!=='number' || !Array.isArray(response.recent_sessions))throw new Error('Guest Insights returned incomplete data.');
    setData(response as Snapshot);
    if(monetizationResult.error || !monetizationResult.data?.guest_ad_diagnostics){
      setMonetization(null);
      setMonetizationError(monetizationResult.error?.message||'Guest monetization snapshot unavailable.');
    }else{
      setMonetization(monetizationResult.data as MonetizationSnapshot);
      setMonetizationError('');
    }
    if(funnel.error || !funnel.data || typeof funnel.data.guest_app_sessions!=='number'){
      setDiscovery(null);
      setDiscoveryError(funnel.error?.message||'Discovery funnel unavailable on this version.');
    }else{
      setDiscovery(funnel.data as DiscoveryFunnel);
      setDiscoveryError('');
    }
    if(visitSummaryResult.error || typeof visitSummaryResult.data?.estimated_visits!=='number'){
      setVisitSummary(null);
      setVisitSummaryError(visitSummaryResult.error?.message||'Inactivity-based visit estimates unavailable.');
    }else{
      setVisitSummary(visitSummaryResult.data as VisitSummary);
      setVisitSummaryError('');
    }
    if(groups.error || !Array.isArray(groups.data)){
      setVisitors([]);
      setVisitorError(groups.error?.message||'Guest grouping unavailable.');
    }else{
      setVisitors(groups.data as Visitor[]);
      setVisitorError('');
    }
    setError('');
  },[days]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    setSelected(null);
    setDiscovery(null);
    setDiscoveryError('');
    setMonetization(null);
    setMonetizationError('');
    setSelectedVisitor(null);
    setEvents([]);
    void load().catch(reason=>{if(active){setData(null);setError(reason?.message||'Guest Insights unavailable.')}}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[load]);
  const refresh=async()=>{
    setRefreshing(true);
    try{await load()}catch(reason:any){setError(reason?.message||'Refresh unavailable.')}finally{setRefreshing(false)}
  };
  const open=async(session:Session)=>{
    if(selected?.session_id===session.session_id){setSelected(null);setEvents([]);return}
    setSelected(session);
    setEvents([]);
    setDetailBusy(true);
    try{
      const result=await getKleenestSupabaseClient().rpc('owner_guest_journey_session',{p_session_id:session.session_id});
      if(result.error)throw result.error;
      setEvents(Array.isArray(result.data)?result.data:[]);
    }catch(reason:any){setError(reason?.message||'Could not load guest timeline.')}
    finally{setDetailBusy(false)}
  };
  const installCount=(name:string)=>data?.acquisition_events?.find(item=>item.event_name===name)?.events??0;
  const visibleVisitors=visitors.filter(visitor=>{
    if(visitorFilter==='returning')return (visitor.visit_count??0)>1;
    if(visitorFilter==='multi_day')return visitor.active_days>1;
    if(visitorFilter==='single')return visitor.visit_count===1;
    if(visitorFilter==='relaunch')return (visitor.relaunch_sessions??0)>0;
    if(visitorFilter==='friction')return visitor.friction_events>0;
    if(visitorFilter==='engaged')return visitor.place_selections+visitor.navigation_starts+visitor.review_actions>0;
    return true;
  }).sort((a,b)=>visitorSort==='frequent'
    ? (b.visit_count??0)-(a.visit_count??0) || Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at)
    : Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at));
  const filterLabels:Record<VisitorFilter,string>={all:'All',returning:'Separated returns',multi_day:'Multi-day',single:'One visit',relaunch:'Rapid relaunches',friction:'Friction',engaged:'Engaged'};
  const MetricCard=({title,value,detail}:{title:string;value:unknown;detail:string})=><View style={{...card,flexGrow:1,minWidth:138,flexBasis:'43%',gap:5}}>
    <Text style={{color:theme.muted,fontSize:12,fontWeight:'700'}}>{title}</Text>
    <Text style={{color:theme.ink,fontSize:25,fontWeight:'900'}}>{format(value)}</Text>
    <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>{detail}</Text>
  </View>;
  return <ScrollView style={{flex:1,backgroundColor:theme.canvas}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={{padding:16,paddingBottom:80,gap:13,backgroundColor:theme.canvas,minHeight:'100%'}}>
    <SectionHeader title="Guest Insights" body="Anonymous journeys, engagement, acquisition and friction. Private to the platform owner."/>
    <View style={{flexDirection:'row',gap:9}}>
      {([7,30] as const).map(period=><Pressable key={period} onPress={()=>setDays(period)} accessibilityRole="button" accessibilityState={{selected:days===period}} style={{...card,paddingVertical:10,backgroundColor:days===period?theme.accent:theme.surface,flex:1,alignItems:'center'}}>
        <Text style={{color:days===period?theme.accentText:theme.ink,fontWeight:'900'}}>{period} days</Text>
      </Pressable>)}
    </View>
    {loading?<ActivityIndicator size="large" color={theme.accent}/>:null}
    {error?<Text accessibilityRole="alert" style={{color:theme.danger}}>{error}</Text>:null}
    {data?<>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <MetricCard title="Guest sessions · legacy tally" value={data.historical_guest_sessions} detail="Recorded foreground sessions, not people"/>
        <MetricCard title="Journeys tracked" value={data.tracked_sessions} detail="Sessions with detailed event coverage"/>
        <MetricCard title="Approximate visitors" value={data.approximate_visitors} detail="Distinct first-party IDs; not guaranteed unique people"/>
        <MetricCard title="Guest visits · estimated" value={visitSummary?.estimated_visits} detail="Events separated by over 30 minutes of inactivity"/>
        <MetricCard title="Separated returning IDs" value={visitSummary?.returning_identifiers} detail="Multiple independent visit windows; not verified people"/>
        <MetricCard title="Rapid relaunches" value={visitSummary?.relaunch_sessions} detail="Additional foreground sessions inside visit windows"/>
        <MetricCard title="Multi-day guest IDs" value={visitSummary?.multi_day_identifiers} detail="Observed on more than one UTC calendar day"/>
        <MetricCard title="Engaged sessions" value={data.engaged_sessions} detail="Selected a place, navigated or started a review"/>
        <MetricCard title="Navigated" value={data.navigation_sessions} detail="Sessions with directions started"/>
        <MetricCard title="No-results sessions" value={data.zero_result_sessions} detail="Missing results worth investigating"/>
        <MetricCard title="Linked registrations" value={data.registrations_linked} detail="Recently created accounts linked to prior guest activity"/>
      </View>
      <View style={{...card,gap:10}}>
        <Text style={{color:theme.ink,fontWeight:'900',fontSize:17}}>Guest → Discovery funnel</Text>
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Based on recorded guest app sessions, not landing-page views. Distinct pseudonymous IDs are not verified individuals.</Text>
        {discoveryError?<Text accessibilityRole="alert" style={{color:theme.danger,fontSize:12}}>{discoveryError}</Text>:null}
        {discovery?<><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          <MetricCard title="Guest app visits" value={discovery.guest_app_sessions} detail="Sessions where the consumer app opened"/>
          <MetricCard title="Discovery shown" value={discovery.discovery_sessions} detail={`${format(discovery.discovery_rate_percent)}% of guest app visits; includes automatic nearby results`}/>
          <MetricCard title="Intentional Discovery" value={discovery.intentional_discovery_sessions} detail={`${format(discovery.intentional_rate_percent)}% searched, applied filters, selected places or navigated`}/>
          <MetricCard title="Places selected" value={discovery.place_selected_sessions} detail={`${format(discovery.place_selection_rate_percent)}% of guest app visits`}/>
        </View>
        <Text style={{color:theme.ink,fontWeight:'800'}}>Activity breakdown (distinct sessions)</Text>
        {([
          ['Nearby results displayed',discovery.discovery_result_sessions],
          ['Search performed',discovery.search_sessions],
          ['Filters applied',discovery.filtered_sessions],
          ['Place opened',discovery.place_selected_sessions],
          ['Directions started',discovery.navigation_sessions],
          ['No Discovery activity',discovery.non_discovery_sessions],
          ['Zero-result sessions',discovery.zero_result_sessions],
        ] as const).map(([label,value])=><View key={label} style={{flexDirection:'row',justifyContent:'space-between',gap:10}}>
          <Text style={{color:theme.muted,flex:1}}>{label}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(value)}</Text>
        </View>)}
        <Text style={{color:theme.ink,fontWeight:'800'}}>Guest journey connection</Text>
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>{format(discovery.guest_entry_discovery_visitor_ids)} of {format(discovery.guest_entry_visitor_ids)} tracked visitor IDs had both a guest-entry event and Discovery activity (possibly across sessions; event order is not inferred). {format(discovery.returning_discovery_visitor_ids)} returning visitor IDs have Discovery activity.</Text>
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Categories overlap: searching and selecting a place in the same visit counts once in each category, never twice in the total. Events before guest journey instrumentation cannot be retroactively matched.</Text>
        </>:null}
      </View>
      <View style={{...card,gap:10}}>
        <Text style={{color:theme.ink,fontWeight:'900',fontSize:17}}>Guest → Ads → Install → Upgrade</Text>
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Production diagnostics for the selected window. No assumed revenue, install completion, or cross-device attribution.</Text>
        {monetizationError?<Text accessibilityRole="alert" style={{color:theme.danger,fontSize:12}}>{monetizationError}</Text>:null}
        {monetization?<><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          <MetricCard title="Guest sessions" value={monetization.guest.sessions} detail="Recorded guest app and visit sessions"/>
          <MetricCard title="Guest identifiers" value={monetization.guest.visitor_keys} detail="Pseudonymous identifiers, not verified people"/>
          <MetricCard title="Network request attempts" value={monetization.guest_ad_diagnostics.network_request_attempts} detail="Client-reported guest requests, not ad fills"/>
          <MetricCard title="Web ad slot missing" value={monetization.guest_ad_diagnostics.web_missing_config} detail="AdSense slot configuration missing when placement was eligible"/>
          <MetricCard title="Guest sponsored exposures" value={monetization.guest_ad_diagnostics.sponsored_impressions} detail="Unverified anonymous impressions; not billable"/>
          <MetricCard title="Guest sponsor clicks" value={monetization.guest_ad_diagnostics.sponsored_clicks} detail="Unverified anonymous click signals"/>
          <MetricCard title="Install CTA views" value={monetization.guest_ad_diagnostics.install_upsell_views} detail="Guest install prompts shown after discovery"/>
          <MetricCard title="Install CTA clicks" value={monetization.guest_ad_diagnostics.install_upsell_clicks} detail="Guests choosing the installation path"/>
          <MetricCard title="Remove Ads intent" value={monetization.guest_ad_diagnostics.upgrade_intents} detail="Guest entry into $5 membership path"/>
          <MetricCard title="Install success events" value={monetization.guest.install_successes} detail="Observed browser/native confirmation events"/>
        </View>
        <Text style={{color:theme.ink,fontWeight:'900'}}>Separate authenticated / platform signals</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          <MetricCard title="Native AdMob fills" value={monetization.native_admob.fills} detail={`${format(monetization.native_admob.requests)} requests; Android/iOS only`}/>
          <MetricCard title="Native ad impressions" value={monetization.native_admob.impressions} detail="SDK impression callbacks; not earnings"/>
          <MetricCard title="Signed-in sponsored impressions" value={monetization.authenticated_sponsorship.authenticated_impressions} detail="Existing sponsor ledger, not anonymous traffic"/>
          <MetricCard title="Verified store purchases" value={monetization.purchases.verified_store_purchases} detail="Platform-wide; not attributed to guests"/>
        </View>
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Ad revenue: not connected to this dashboard. Confirm actual earnings using the ad network and store reporting before using revenue figures.</Text>
        <Text style={{color:theme.muted,fontSize:11,lineHeight:17}}>{monetization.measurement_note}</Text>
        </>:null}
      </View>
      <View style={{...card,gap:6}}>
        <Text style={{color:theme.ink,fontWeight:'900',fontSize:16}}>Understanding coverage</Text>
        <Text style={{color:theme.muted,lineHeight:21}}>Foreground sessions are not separate visits: six quick app opens can be one visit. A new visit starts only after more than 30 minutes without recorded activity. Identifiers are not verified people, and absence of events may reflect incomplete instrumentation. Historical acquisition events use different keys; do not merge them into unique visitors.</Text>
        {visitSummaryError?<Text accessibilityRole="alert" style={{color:theme.danger}}>Visit estimates unavailable: {visitSummaryError}</Text>:null}
        <Text style={{color:theme.muted}}>Updated {dateTime(data.updated_at)} · {format(data.tracked_events)} detailed events recorded for this period</Text>
      </View>
      <View style={{...card,gap:8}}>
        <Text style={{color:theme.ink,fontSize:17,fontWeight:'900'}}>Installation progress</Text>
        {(['landing_view','install_intent','install_guidance_view','install_prompt_accepted','install_prompt_dismissed','install_success','installed_app_launch'] as const).map(name=><View key={name} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}><Text style={{color:theme.muted,flex:1}}>{readable(name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(installCount(name))}</Text></View>)}
        <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Events are not unique people. New install stages begin after the upgrade; older versions could count an accepted browser prompt as installation success.</Text>
        <Text style={{color:theme.ink,fontWeight:'900'}}>Install activity by device and browser</Text>
        {data.install_browser_events?.length ? data.install_browser_events.filter(entry=>['install_intent','install_success','installed_app_launch'].includes(entry.event_name)).map((entry,i)=><View key={i} style={{flexDirection:'row',justifyContent:'space-between',gap:8}}><Text style={{color:theme.muted,flex:1,fontSize:12}}>{readable(entry.device_kind)} · {readable(entry.browser_kind)} · {readable(entry.event_name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(entry.events)}</Text></View>) : <Text style={{color:theme.muted,fontSize:12}}>Breakdown begins when the upgraded instrumentation records activity.</Text>}
      </View>
      <View style={{...card,gap:9}}>
        <Text style={{color:theme.ink,fontSize:17,fontWeight:'900'}}>Acquisition actions · historical source</Text>
        {data.acquisition_events?.length?data.acquisition_events.map(item=><View key={item.event_name} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}>
          <Text style={{color:theme.muted,flex:1}}>{readable(item.event_name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(item.events)}</Text>
        </View>):<Text style={{color:theme.muted}}>No events in this window.</Text>}
        <Text style={{color:theme.muted,fontSize:12}}>Install intent does not prove an installation. Actions may repeat.</Text>
      </View>
      <View style={{...card,gap:9}}>
        <Text style={{color:theme.ink,fontSize:17,fontWeight:'900'}}>Guest behavior · newly tracked</Text>
        {data.events_by_type?.length?data.events_by_type.map(item=><View key={item.event_name} style={{flexDirection:'row',justifyContent:'space-between',gap:12}}>
          <Text style={{color:theme.muted,flex:1}}>{readable(item.event_name)}</Text><Text style={{color:theme.ink,fontWeight:'800'}}>{format(item.events)}</Text>
        </View>):<Text style={{color:theme.muted}}>New telemetry will appear after the updated app records guest activity.</Text>}
      </View>

      <View style={{gap:9}}>
        <SectionHeader title="Guest histories" body="Group observed sessions by their existing first-party visitor identifier. One identifier can still be shared, reset or reused; it does not prove a person's identity."/>
        {visitorError?<Text accessibilityRole="alert" style={{color:theme.danger}}>Grouped histories unavailable: {visitorError}. Showing recent individual sessions instead.</Text>:null}
        {!visitorError&&visitors.length>0?<View style={{gap:9}}>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
            {(['all','returning','multi_day','single','relaunch','friction','engaged'] as const).map(filter=><Pressable key={filter} accessibilityRole="button" accessibilityState={{selected:visitorFilter===filter}} onPress={()=>setVisitorFilter(filter)} style={{borderWidth:1,borderColor:visitorFilter===filter?theme.accent:theme.line,backgroundColor:visitorFilter===filter?theme.accent:theme.surface,borderRadius:9,paddingHorizontal:11,paddingVertical:8}}>
              <Text style={{color:visitorFilter===filter?theme.accentText:theme.ink,fontWeight:'800',fontSize:12}}>{filterLabels[filter]}</Text>
            </Pressable>)}
          </View>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10}}>
            <Text style={{color:theme.muted,fontSize:12}}>{visibleVisitors.length} grouped IDs shown · {visitors.length} loaded</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Change guest sorting" onPress={()=>setVisitorSort(value=>value==='recent'?'frequent':'recent')} style={{padding:9,borderRadius:8,borderWidth:1,borderColor:theme.line}}>
              <Text style={{color:theme.accent,fontWeight:'800',fontSize:12}}>{visitorSort==='recent'?'Most recent ▾':'Most visits ▾'}</Text>
            </Pressable>
          </View>
          {visitors.length < (data?.approximate_visitors||0)?<Text style={{color:theme.muted,fontSize:12}}>Showing the 200 most recently active IDs at most; totals include all IDs in the period.</Text>:null}
          {!visibleVisitors.length?<View style={card}><Text style={{color:theme.muted}}>No guest histories match this filter.</Text></View>:null}
          {visibleVisitors.map(visitor=><View key={visitor.visitor_label} style={{...card,gap:8}}>
            <Pressable accessibilityRole="button" accessibilityState={{expanded:selectedVisitor===visitor.visitor_label}} onPress={()=>{
              setSelectedVisitor(value=>value===visitor.visitor_label?null:visitor.visitor_label);
              setSelected(null);setEvents([]);
            }} style={{gap:4}}>
              <Text style={{color:theme.accent,fontWeight:'900',fontSize:16}}>Guest {visitor.visitor_label} · {(visitor.visit_count??0)>1?'Returned after break':(visitor.relaunch_sessions??0)>0?'Reopened within one visit':'One observed visit'} {selectedVisitor===visitor.visitor_label?'▴':'▾'}</Text>
              <Text style={{color:theme.ink,fontWeight:'700'}}>{format(visitor.visit_count)} visits · {format(visitor.session_count)} recorded sessions · {format(visitor.active_days)} active days</Text>
              <Text style={{color:theme.muted,fontSize:12}}>{format(visitor.event_count)} events · {format(visitor.relaunch_sessions)} session relaunches within visits</Text>
              <Text style={{color:theme.muted,fontSize:12}}>Last action: {readable(visitor.last_action)} · {dateTime(visitor.last_seen_at)}</Text>
              <Text style={{color:theme.muted,fontSize:12}}>First observed in period: {dateTime(visitor.first_seen_at)}</Text>
            </Pressable>
            {selectedVisitor===visitor.visitor_label?<View style={{gap:9,borderTopWidth:1,borderColor:theme.line,paddingTop:10}}>
              <Text style={{color:theme.ink,fontWeight:'800'}}>Behavior across sessions</Text>
              <Text style={{color:theme.muted,fontSize:12,lineHeight:18}}>Places opened: {format(visitor.place_selections)} · Directions: {format(visitor.navigation_starts)} · Review actions: {format(visitor.review_actions)} · Installation actions: {format(visitor.install_actions)} · Search friction: {format(visitor.friction_events)}</Text>
              {visitor.registration_linked?<Text style={{color:theme.accent,fontWeight:'800'}}>Registration linked to this guest ID</Text>:null}
              <Text style={{color:theme.ink,fontWeight:'800'}}>Estimated visit windows (last {visitor.visit_windows?.length??0})</Text>
              {visitor.visit_windows?.map((window,i)=><View key={String(i)} style={{gap:3,borderTopWidth:1,borderColor:theme.line,paddingTop:7}}>
                <Text style={{color:theme.ink,fontWeight:'700'}}>Visit {i+1} · {format(window.session_count)} sessions · {format(window.event_count)} events</Text>
                <Text style={{color:theme.muted,fontSize:12}}>{dateTime(window.started_at)} to {dateTime(window.last_seen_at)} · {format(window.place_selections)} places selected</Text>
              </View>)}
              <Text style={{color:theme.ink,fontWeight:'800'}}>Recent raw sessions ({visitor.sessions.length} shown of {visitor.session_count})</Text>
              {visitor.sessions.map(session=><View key={session.session_id} style={{borderTopWidth:1,borderColor:theme.line,paddingTop:7,gap:4}}>
                <Pressable accessibilityRole="button" accessibilityState={{expanded:selected?.session_id===session.session_id}} onPress={()=>void open(session)} style={{gap:3,paddingVertical:5}}>
                  <Text style={{color:theme.accent,fontWeight:'800'}}>{readable(session.last_action)} · {format(session.event_count)} events {selected?.session_id===session.session_id?'▴':'▾'}</Text>
                  <Text style={{color:theme.muted,fontSize:12}}>{dateTime(session.started_at)} to {dateTime(session.last_seen_at)}</Text>
                </Pressable>
                {selected?.session_id===session.session_id?<View style={{gap:7,paddingLeft:8}}>
                  {detailBusy?<ActivityIndicator color={theme.accent}/>:null}
                  {!detailBusy&&!events.length?<Text style={{color:theme.muted}}>No events available for this session.</Text>:null}
                  {!detailBusy&&events.map((entry,i)=><View key={i} style={{gap:2,paddingVertical:4}}>
                    <Text style={{color:theme.ink,fontWeight:'800'}}>{readable(entry.event_name)}{entry.location_name?` · ${entry.location_name}`:''}</Text>
                    <Text style={{color:theme.muted,fontSize:12}}>{dateTime(entry.occurred_at)}</Text>
                    {entry.context&&Object.keys(entry.context).length?journeyContext(entry.context).map((line,index)=><Text key={index} style={{color:theme.muted,fontSize:12}}>{line}</Text>):null}
                  </View>)}
                </View>:null}
              </View>)}
            </View>:null}
          </View>)}
        </View>:null}
        {visitorError?data.recent_sessions.map(session=><View key={session.session_id} style={{...card,gap:4}}>
          <Pressable accessibilityRole="button" onPress={()=>void open(session)}>
            <Text style={{color:theme.accent,fontWeight:'900'}}>Guest {session.visitor_label} · {readable(session.last_action)}</Text>
            <Text style={{color:theme.muted,fontSize:12}}>{dateTime(session.last_seen_at)} · {format(session.event_count)} events</Text>
          </Pressable>
          {selected?.session_id===session.session_id&&events.map((entry,i)=><Text key={i} style={{color:theme.muted,fontSize:12}}>{dateTime(entry.occurred_at)} · {readable(entry.event_name)}</Text>)}
        </View>):null}
        {!visitorError&&!visitors.length?<View style={card}><Text style={{color:theme.muted}}>No detailed guest sessions recorded yet.</Text></View>:null}
      </View>
      <Text style={{color:theme.muted,lineHeight:19,fontSize:12}}>Guest identifiers are pseudonymous first-party random IDs. Search details show the search type, selected amenity filters, result count and a roughly 5 km area cell. No device fingerprinting, IP addresses, exact GPS traces or raw search phrases are saved. Events are capped per session and retained for up to 30 days while new activity is arriving.</Text>
    </>:null}
  </ScrollView>;
}
