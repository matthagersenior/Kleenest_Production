import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Linking,Pressable,RefreshControl,ScrollView,Switch,Text,View } from 'react-native';
import {
  getOfferReadiness,getPilotCapabilityDomains,runOfferLaunchCheck,
  updateOfferGovernance,updatePilotCapabilityDomain,
  type OfferReadiness,type PilotCapabilityDomain
} from '../services/capabilityPilot';
import { runCapabilityAudit } from '../services/ownerAdmin';
import { OSHero,SectionHeader,StatusPill,osCard,osColors } from '../components/KleenestOS';

const commercialStates=['sample','pilot','offered','production','gated'] as const;
const pilotModes=['off','sample','sandbox','limited-live','live'] as const;
const promiseStates=['internal','sample','pilot','offered','production','gated','unavailable'] as const;
const surfaceFilters=['all','consumer','business','fleet','platform'] as const;

const pretty=(value:unknown)=>String(value??'').replaceAll('_',' ').replaceAll('-',' ');
const tone=(ready:boolean,enabled=true)=>!enabled?'neutral':ready?'good':'warning';

function sampleTarget(offer:OfferReadiness){
  const profile=offer.sample_profile||{};
  const external=String(profile.developer_portal||profile.portal||'');
  const route=String(profile.demo_route||profile.entry_route||'');
  const app=String(profile.app||'');
  if(external.startsWith('https://'))return external;
  if(route.startsWith('https://'))return route;
  const normalized=route.replace(/^\/+/, '');
  if(!normalized)return null;
  if(app==='consumer-mobile')return `kleenest://${normalized}`;
  if(app==='business-mobile')return `kleenest-business://${normalized}`;
  if(app==='fleet-mobile')return `kleenest-fleet://${normalized}`;
  return null;
}

function Choice({label,selected,onPress,disabled=false}:{label:string;selected:boolean;onPress:()=>void;disabled?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{
    borderRadius:999,paddingHorizontal:10,paddingVertical:7,
    backgroundColor:selected?osColors.ink:'#edf3ef',opacity:disabled?.55:1
  }}>
    <Text style={{fontSize:11,fontWeight:'900',color:selected?'#fff':osColors.green}}>{label}</Text>
  </Pressable>;
}

function ToggleRow({label,value,onValueChange,disabled=false}:{label:string;value:boolean;onValueChange:(next:boolean)=>void;disabled?:boolean}){
  return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}>
    <Text style={{fontWeight:'800',color:osColors.ink,flex:1}}>{label}</Text>
    <Switch value={value} disabled={disabled} onValueChange={onValueChange}/>
  </View>;
}

function WorkspaceLink({href,title,body}:{href:string;title:string;body:string}){
  return <Link href={href as any} asChild>
    <Pressable style={{...osCard,flexBasis:150,flexGrow:1}}>
      <Text style={{fontWeight:'900',color:osColors.ink}}>{title}</Text>
      <Text style={{fontSize:12,color:osColors.muted,lineHeight:17}}>{body}</Text>
      <Text style={{fontWeight:'900',color:osColors.green}}>Open →</Text>
    </Pressable>
  </Link>;
}

export default function ControlCenter(){
  const[offers,setOffers]=useState<OfferReadiness[]>([]);
  const[domains,setDomains]=useState<PilotCapabilityDomain[]>([]);
  const[busyKey,setBusyKey]=useState('');
  const[message,setMessage]=useState('Loading canonical offer and capability controls…');
  const[surface,setSurface]=useState<(typeof surfaceFilters)[number]>('all');

  async function load(){
    setBusyKey('load');
    try{
      const[nextOffers,nextDomains]=await Promise.all([getOfferReadiness(),getPilotCapabilityDomains()]);
      setOffers(nextOffers);
      setDomains(nextDomains);
      setMessage('');
    }catch(error:any){
      setMessage(error?.message||'Control Center unavailable.');
    }finally{setBusyKey('')}
  }
  useEffect(()=>{void load()},[]);

  const filteredDomains=useMemo(()=>domains.filter(domain=>
    surface==='all'||domain.owner_surface===surface||domain.owner_workspace===`${surface}-mobile`
  ),[domains,surface]);

  const counts=useMemo(()=>({
    production:offers.filter(o=>o.production_ready).length,
    pilot:offers.filter(o=>o.pilot_ready).length,
    sample:offers.filter(o=>o.sample_ready).length,
    blocked:offers.filter(o=>!o.sample_ready||!o.pilot_ready).length
  }),[offers]);

  async function patchOffer(offer:OfferReadiness,patch:Record<string,unknown>,reason:string){
    const key=`offer:${offer.offer_key}`;setBusyKey(key);
    try{await updateOfferGovernance(offer.offer_key,patch,reason);await load()}
    catch(error:any){setMessage(error?.message||'Offer governance update failed.');setBusyKey('')}
  }
  async function patchDomain(domain:PilotCapabilityDomain,patch:Record<string,unknown>,reason:string){
    const key=`domain:${domain.domain}`;setBusyKey(key);
    try{await updatePilotCapabilityDomain(domain.domain,patch,reason);await load()}
    catch(error:any){setMessage(error?.message||'Capability governance update failed.');setBusyKey('')}
  }
  async function check(offer:OfferReadiness,type:'sample'|'pilot'|'production'){
    const key=`check:${offer.offer_key}:${type}`;setBusyKey(key);
    try{
      const result=await runOfferLaunchCheck(offer.offer_key,type);
      setMessage(`${offer.label}: ${pretty(type)} check ${result.status} · canonical audit ${result.canonical_audit_issue_count}`);
      await load();
    }catch(error:any){setMessage(error?.message||`${pretty(type)} launch check failed.`);setBusyKey('')}
  }
  async function openSample(offer:OfferReadiness){
    const target=sampleTarget(offer);
    if(!target){setMessage(`${offer.label} does not have a configured sample target.`);return}
    try{await Linking.openURL(target)}catch{setMessage(`Could not open ${offer.label} sample on this device.`)}
  }
  async function audit(){
    setBusyKey('audit');
    try{
      const result:any=await runCapabilityAudit();
      setMessage(`Capability audit complete · ${Number(result?.issue_count||0)} issues across ${Number(result?.domain_count||0)} domains.`);
      await load();
    }catch(error:any){setMessage(error?.message||'Capability audit failed.');setBusyKey('')}
  }

  return <ScrollView
    refreshControl={<RefreshControl refreshing={busyKey==='load'} onRefresh={load}/>}
    contentContainerStyle={{padding:14,gap:15,paddingBottom:90,backgroundColor:osColors.paper}}
  >
    <OSHero eyebrow="KLEENESTOS CONTROL CENTER" title="CONTROL" body="Operate what Kleenest can demonstrate, pilot, sell and run. Global controls live here; search is only for individual records.">
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
        <StatusPill label={`${counts.production} PRODUCTION READY`} tone="good"/>
        <StatusPill label={`${counts.pilot} PILOT READY`} tone="good"/>
        <StatusPill label={`${counts.sample} SAMPLE READY`} tone="good"/>
        {counts.blocked?<StatusPill label={`${counts.blocked} NEED REVIEW`} tone="warning"/>:null}
      </View>
    </OSHero>

    {message?<View style={{...osCard,backgroundColor:'#fffaf0'}}><Text style={{fontWeight:'800',color:osColors.warning}}>{message}</Text></View>:null}

    <View style={{gap:9}}>
      <SectionHeader title="Global workspaces" body="Reach the real owner controls directly. Search is reserved for record-level administration."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <WorkspaceLink href="/notifications" title="Messaging" body="Rules, audiences, consent, dry-runs and delivery."/>
        <WorkspaceLink href="/progression" title="Economy" body="XP, objectives, progression supply and rewards."/>
        <WorkspaceLink href="/businesses" title="Businesses" body="Verification, tiers, Fleet/Enterprise access and members."/>
        <WorkspaceLink href="/access" title="People & Access" body="Roles, subscriptions and administrative authority."/>
        <WorkspaceLink href="/moderation" title="Trust & Moderation" body="Review, safety and AI report decisions."/>
        <WorkspaceLink href="/developers" title="Developer Platform" body="Partners, API products, credentials, webhooks and quotas."/>
        <WorkspaceLink href="/pilots" title="Pilots" body="Named pilot sessions, launch manifests and history."/>
        <WorkspaceLink href="/operations" title="Operations" body="Ingestion, storage guards, sources and scheduler controls."/>
      </View>
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Offer controls" body="These are the actual Kleenest offers represented in the business model. Control sample, pilot and commercial readiness directly." actionLabel="Run live audit" onAction={audit}/>
      {offers.map(offer=>{
        const key=`offer:${offer.offer_key}`,disabled=Boolean(busyKey&&busyKey!==key);
        const target=sampleTarget(offer);
        return <View key={offer.offer_key} style={{...osCard,gap:10}}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
            <View style={{flex:1,gap:3}}>
              <Text style={{fontSize:17,fontWeight:'900',color:osColors.ink}}>{offer.label}</Text>
              <Text style={{fontSize:12,color:osColors.muted}}>{pretty(offer.audience)} · {offer.description}</Text>
            </View>
            <StatusPill label={pretty(offer.commercial_state).toUpperCase()} tone={offer.production_ready?'good':offer.pilot_ready?'warning':'danger'}/>
          </View>

          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
            <StatusPill label="Sample ready" tone={tone(offer.sample_ready,offer.sample_enabled)}/>
            <StatusPill label="Pilot ready" tone={tone(offer.pilot_ready,offer.pilot_enabled)}/>
            <StatusPill label="Production ready" tone={tone(offer.production_ready,true)}/>
            {offer.release_blockers.map(blocker=><StatusPill key={blocker} label={pretty(blocker)} tone="warning"/>)}
          </View>

          <ToggleRow label="Sample enabled" value={offer.sample_enabled} disabled={disabled} onValueChange={next=>void patchOffer(offer,{sample_enabled:next},`Sample ${next?'enabled':'disabled'} in KleenestOS Control Center`)}/>
          <ToggleRow label="Pilot enabled" value={offer.pilot_enabled} disabled={disabled} onValueChange={next=>void patchOffer(offer,{pilot_enabled:next},`Pilot ${next?'enabled':'disabled'} in KleenestOS Control Center`)}/>

          <Text style={{fontSize:11,fontWeight:'900',color:osColors.muted}}>Commercial state</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
            {commercialStates.map(state=><Choice key={state} label={pretty(state)} selected={offer.commercial_state===state} disabled={disabled} onPress={()=>void patchOffer(offer,{commercial_state:state},`Commercial state set to ${state} in KleenestOS Control Center`)}/>)}
          </View>

          <Text style={{fontSize:11,fontWeight:'900',color:osColors.muted}}>Pilot mode</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
            {pilotModes.map(mode=><Choice key={mode} label={pretty(mode)} selected={offer.pilot_mode===mode} disabled={disabled} onPress={()=>void patchOffer(offer,{pilot_mode:mode},`Pilot mode set to ${mode} in KleenestOS Control Center`)}/>)}
          </View>

          <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
            <Choice label="Open sample" selected={false} disabled={!target||!offer.sample_enabled||!offer.sample_ready} onPress={()=>void openSample(offer)}/>
            <Choice label="Run sample check" selected={false} disabled={Boolean(busyKey)} onPress={()=>void check(offer,'sample')}/>
            <Choice label="Run pilot check" selected={false} disabled={Boolean(busyKey)} onPress={()=>void check(offer,'pilot')}/>
            <Choice label="Run production check" selected={false} disabled={Boolean(busyKey)} onPress={()=>void check(offer,'production')}/>
          </View>

          <Text style={{fontSize:11,color:osColors.muted}}>
            {offer.required_domains.length} required domains · {offer.missing_domains.length} missing · {offer.inactive_domains.length} inactive
          </Text>
          {offer.owner_notes?<Text style={{fontSize:12,color:osColors.muted,lineHeight:17}}>{offer.owner_notes}</Text>:null}
        </View>
      })}
    </View>

    <View style={{gap:9}}>
      <SectionHeader title="Capability controls" body="Change whether canonical capability domains may be sampled, piloted or promised. No business/user search required."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
        {surfaceFilters.map(item=><Choice key={item} label={item==='all'?'All':pretty(item)} selected={surface===item} onPress={()=>setSurface(item)}/>)}
      </View>
      {filteredDomains.map(domain=>{
        const key=`domain:${domain.domain}`,disabled=Boolean(busyKey&&busyKey!==key);
        return <View key={domain.domain} style={osCard}>
          <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:9}}>
            <View style={{flex:1,gap:2}}>
              <Text style={{fontWeight:'900',color:osColors.ink}}>{domain.canonical_capability}</Text>
              <Text style={{fontSize:11,color:osColors.muted}}>{domain.domain} · {pretty(domain.owner_surface)} · {domain.canonical_rpc}</Text>
            </View>
            <StatusPill label={domain.rpc_exists?'RPC LIVE':'RPC MISSING'} tone={domain.rpc_exists?'good':'danger'}/>
          </View>
          <ToggleRow label="Sample enabled" value={domain.sample_enabled} disabled={disabled} onValueChange={next=>void patchDomain(domain,{sample_enabled:next},`Capability sample ${next?'enabled':'disabled'} in KleenestOS Control Center`)}/>
          <ToggleRow label="Pilot enabled" value={domain.pilot_enabled} disabled={disabled} onValueChange={next=>void patchDomain(domain,{pilot_enabled:next},`Capability pilot ${next?'enabled':'disabled'} in KleenestOS Control Center`)}/>
          <Text style={{fontSize:11,fontWeight:'900',color:osColors.muted}}>Promise state</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
            {promiseStates.map(state=><Choice key={state} label={pretty(state)} selected={domain.promise_state===state} disabled={disabled} onPress={()=>void patchDomain(domain,{promise_state:state},`Capability promise state set to ${state} in KleenestOS Control Center`)}/>)}
          </View>
          <Text style={{fontSize:11,fontWeight:'900',color:osColors.muted}}>Pilot mode</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
            {pilotModes.map(mode=><Choice key={mode} label={pretty(mode)} selected={domain.pilot_mode===mode} disabled={disabled} onPress={()=>void patchDomain(domain,{pilot_mode:mode},`Capability pilot mode set to ${mode} in KleenestOS Control Center`)}/>)}
          </View>
        </View>
      })}
    </View>
  </ScrollView>;
}
