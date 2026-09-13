import { useEffect,useMemo,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,TextInput,Pressable,View } from 'react-native';
import { currentBusinessId,listBusinessWorkspaceOptions } from '../services/capabilityWorkflows';
import {
  getClaimVerificationStatus,listBusinessClaimCases,listIncomingBusinessClaimCases,
  resolveIncomingBusinessClaim,startClaimDnsVerification,verifyClaimCompanyEmail,verifyClaimDns,
} from '../services/claimVerification';

type Row=Record<string,any>;
type DnsChallenge={claimId:string;challengeId:string;dnsName:string;token:string;expiresAt:string};

function evidence(value:any){return Array.isArray(value)?value.map(String):[];}
function titleCase(value:any){return String(value??'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function riskBand(score:any){const n=Number(score??0);return n>=80?'HIGH':n>=50?'MEDIUM':'LOW';}

export default function VerificationCenter(){
 const[businessId,setBusinessId]=useState('');
 const[role,setRole]=useState('');
 const[outgoing,setOutgoing]=useState<Row[]>([]);
 const[incoming,setIncoming]=useState<Row[]>([]);
 const[dns,setDns]=useState<DnsChallenge|null>(null);
 const[claimStatus,setClaimStatus]=useState<Record<string,any>>({});
 const[notes,setNotes]=useState<Record<string,string>>({});
 const[busy,setBusy]=useState('');
 const[message,setMessage]=useState('Loading verification cases…');

 async function load(){
  setBusy('load');
  try{
   const id=businessId||await currentBusinessId();
   setBusinessId(id);
   const[own,inc,workspaces]=await Promise.all([
    listBusinessClaimCases(id),listIncomingBusinessClaimCases(id),listBusinessWorkspaceOptions(),
   ]);
   setOutgoing(own);setIncoming(inc);
   const current=(Array.isArray(workspaces)?workspaces:[]).find((row:any)=>String(row.business_id)===id);
   setRole(String(current?.role||''));
   setMessage('');
  }catch(e:any){setMessage(e?.message||'Verification Center is unavailable.')}
  finally{setBusy('')}
 }
 useEffect(()=>{void load()},[]);
 const canResolve=useMemo(()=>['owner','admin'].includes(role.toLowerCase()),[role]);

 async function run(key:string,fn:()=>Promise<any>,success:string,claimId?:string){
  setBusy(key);setMessage('');
  try{
   const result=await fn();
   if(claimId)try{setClaimStatus(v=>({...v,[claimId]:await getClaimVerificationStatus(claimId)}))}catch{}
   setMessage(result?.autoApproved?'Verification complete. Kleenest automatically approved this unclaimed location.':success);
   await load();
  }catch(e:any){setMessage(e?.message||'Verification action failed.')}
  finally{setBusy('')}
 }
 async function inspect(claimId:string){
  setBusy('status:'+claimId);
  try{setClaimStatus(v=>({...v,[claimId]:await getClaimVerificationStatus(claimId)}));setMessage('')}
  catch(e:any){setMessage(e?.message||'Verification details unavailable.')}
  finally{setBusy('')}
 }
 async function startDns(claimId:string){
  setBusy('dns-start:'+claimId);setMessage('');
  try{
   const result=await startClaimDnsVerification(claimId);
   setDns({claimId,challengeId:String(result.challengeId),dnsName:String(result.dnsName),token:String(result.token),expiresAt:String(result.expiresAt)});
   setClaimStatus(v=>({...v,[claimId]:await getClaimVerificationStatus(claimId)}));
   setMessage('DNS challenge created. Publish the TXT value exactly, then verify after DNS propagation.');
  }catch(e:any){setMessage(e?.message||'DNS challenge could not be created.')}
  finally{setBusy('')}
 }

 return <ScrollView refreshControl={<RefreshControl refreshing={busy==='load'} onRefresh={load}/>} contentContainerStyle={s.page}>
  <View style={s.hero}>
   <Text style={s.eyebrow}>BUSINESS CLAIM & VERIFICATION CENTER</Text>
   <Text style={s.title}>Payment buys the workspace. Evidence earns authority.</Text>
   <Text style={s.body}>A Kleenest subscription never proves ownership. Existing-location control requires verified evidence, current-operator consent, or Kleenest review. High-risk transfer requests cannot silently take over a location.</Text>
  </View>
  <View style={s.ruleCard}>
   <Rule n="1" title="Workspace customer" body="Account and paid product access only. No claim authority implied."/>
   <Rule n="2" title="Business identity verified" body="Kleenest has strong evidence tying the account to the canonical company domain."/>
   <Rule n="3" title="Location operator verified" body="The location is approved by dual evidence, the current operator, or Kleenest review."/>
  </View>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  <View style={s.section}>
   <Text style={s.sectionTitle}>Your outgoing claims</Text>
   <Text style={s.sectionCopy}>For an unclaimed location, confirmed company-domain email + DNS control can qualify for automatic approval. If another Business already operates the location, evidence helps your case but never auto-transfers control.</Text>
   {outgoing.length?outgoing.map(row=>{
    const id=String(row.claim_id);
    const status=claimStatus[id]||{};
    const ev=evidence(row.verified_evidence);
    const activeDns=dns?.claimId===id?dns:null;
    const existing=Boolean(row.existing_operator_present);
    return <View key={id} style={s.card}>
      <View style={s.top}><View style={{flex:1,gap:2}}><Text style={s.cardTitle}>{String(row.location_name||'Location')}</Text><Text style={s.meta}>{[row.location_address,row.location_city,row.location_state].filter(Boolean).join(', ')||'Canonical location'}</Text></View><Risk score={row.risk_score}/></View>
      <View style={s.chips}><Pill text={String(row.status||'pending')}/><Pill text={String(row.assurance_level||'workspace_customer')}/><Pill text={String(row.verification_state||'unverified')}/></View>
      {existing?<View style={s.warning}><Text style={s.warningTitle}>CURRENT OPERATOR PROTECTED</Text><Text style={s.warningText}>Another Business already has authority here. Verification evidence cannot auto-transfer it; the current owner/admin or Kleenest must resolve the case.</Text></View>:null}
      <Text style={s.meta}>Evidence: {ev.length?ev.map(titleCase).join(' + '):'None verified yet'}</Text>
      {Array.isArray(row.risk_reasons)&&row.risk_reasons.length?<Text style={s.meta}>Risk signals: {row.risk_reasons.map(titleCase).join(' · ')}</Text>:null}
      {row.resolution_note?<Text style={s.note}>Resolution: {String(row.resolution_note)}</Text>:null}
      <View style={s.actions}>
       <Action label="Check verification options" disabled={Boolean(busy)} onPress={()=>inspect(id)}/>
       <Action label="Verify company email" disabled={Boolean(busy)||String(row.status)==='approved'} onPress={()=>run('email:'+id,()=>verifyClaimCompanyEmail(id),'Company-domain email verified.',id)}/>
       <Action label="Start DNS proof" disabled={Boolean(busy)||String(row.status)==='approved'} onPress={()=>startDns(id)}/>
      </View>
      {status?.canonicalDomain?<Text style={s.meta}>Canonical domain: {String(status.canonicalDomain)} · Company email eligible: {status?.companyEmail?.eligible?'YES':'NO'}</Text>:null}
      {activeDns?<View style={s.dnsBox}><Text style={s.dnsTitle}>DNS TXT CHALLENGE</Text><Text style={s.meta}>Create a TXT record at:</Text><Text selectable style={s.code}>{activeDns.dnsName}</Text><Text style={s.meta}>TXT value:</Text><Text selectable style={s.code}>{activeDns.token}</Text><Text style={s.meta}>Expires: {new Date(activeDns.expiresAt).toLocaleString()}</Text><Action label="Verify DNS now" disabled={Boolean(busy)} onPress={()=>run('dns-verify:'+id,()=>verifyClaimDns(id,activeDns.challengeId),'DNS control verified.',id)}/></View>:null}
    </View>
   }):<Empty text="No outgoing location claims."/ >}
  </View>

  <View style={s.section}>
   <Text style={s.sectionTitle}>Requests against locations you operate</Text>
   <Text style={s.sectionCopy}>Managers can inspect these cases. Only Business owners/admins can approve a transfer, reject it, or escalate it to Kleenest.</Text>
   {!canResolve&&incoming.length?<View style={s.warning}><Text style={s.warningTitle}>VIEW ONLY</Text><Text style={s.warningText}>Your role is {role||'member'}. Owner/admin authority is required to resolve transfer requests.</Text></View>:null}
   {incoming.length?incoming.map(row=>{
    const id=String(row.claim_id),open=['pending','disputed'].includes(String(row.status));
    return <View key={id} style={s.card}>
      <View style={s.top}><View style={{flex:1,gap:2}}><Text style={s.cardTitle}>{String(row.location_name||'Location')}</Text><Text style={s.meta}>{String(row.requesting_business_name||'Another Business')} is requesting location authority.</Text></View><Risk score={row.risk_score}/></View>
      <View style={s.chips}><Pill text={String(row.status)}/><Pill text={String(row.assurance_level)}/></View>
      <Text style={s.meta}>Verified evidence: {evidence(row.verified_evidence).length?evidence(row.verified_evidence).map(titleCase).join(' + '):'None'}</Text>
      {open?<><TextInput value={notes[id]||''} onChangeText={v=>setNotes(n=>({...n,[id]:v}))} placeholder="Decision note / reason" placeholderTextColor="#77857d" style={s.input}/><View style={s.actions}><Action label="Approve transfer" disabled={!canResolve||Boolean(busy)} onPress={()=>run('approve:'+id,()=>resolveIncomingBusinessClaim({businessId,claimId:id,action:'approve_transfer',note:notes[id]}),'Location authority transferred.')}/><Action danger label="Reject" disabled={!canResolve||Boolean(busy)} onPress={()=>run('reject:'+id,()=>resolveIncomingBusinessClaim({businessId,claimId:id,action:'reject',note:notes[id]}),'Claim rejected.')}/><Action quiet label="Escalate to Kleenest" disabled={!canResolve||Boolean(busy)} onPress={()=>run('escalate:'+id,()=>resolveIncomingBusinessClaim({businessId,claimId:id,action:'escalate',note:notes[id]}),'Claim escalated for Kleenest review.')}/></View></>:null}
    </View>
   }):<Empty text="No other Business is requesting authority over your locations."/>}
  </View>
 </ScrollView>;
}
function Rule({n,title,body}:{n:string;title:string;body:string}){return <View style={s.rule}><Text style={s.ruleN}>{n}</Text><View style={{flex:1}}><Text style={s.ruleTitle}>{title}</Text><Text style={s.meta}>{body}</Text></View></View>}
function Risk({score}:{score:any}){const n=Number(score??0);return <View style={[s.risk,n>=80?s.riskHigh:n>=50?s.riskMedium:s.riskLow]}><Text style={s.riskText}>{riskBand(n)} · {n}</Text></View>}
function Pill({text}:{text:string}){return <View style={s.pill}><Text style={s.pillText}>{titleCase(text)}</Text></View>}
function Action({label,onPress,disabled,danger=false,quiet=false}:{label:string;onPress:()=>void|Promise<void>;disabled?:boolean;danger?:boolean;quiet?:boolean}){return <Pressable disabled={disabled} onPress={onPress} style={[s.action,danger&&s.danger,quiet&&s.quiet,disabled&&s.disabled]}><Text style={[s.actionText,quiet&&s.quietText]}>{label}</Text></Pressable>}
function Empty({text}:{text:string}){return <View style={s.card}><Text style={s.meta}>{text}</Text></View>}
const s=StyleSheet.create({
 page:{padding:18,gap:18,backgroundColor:'#f3f6f4',paddingBottom:70},hero:{backgroundColor:'#102c20',borderRadius:24,padding:20,gap:7},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.3,color:'#bfe2cd'},title:{fontSize:28,lineHeight:33,fontWeight:'900',color:'#fff'},body:{fontSize:14,lineHeight:21,color:'#dbe9e1'},
 ruleCard:{backgroundColor:'#fff',borderRadius:18,padding:14,gap:10,borderWidth:1,borderColor:'#dbe5de'},rule:{flexDirection:'row',gap:10,alignItems:'flex-start'},ruleN:{width:27,height:27,textAlign:'center',textAlignVertical:'center',borderRadius:999,backgroundColor:'#173f2d',color:'#fff',fontWeight:'900'},ruleTitle:{fontSize:14,fontWeight:'900',color:'#173528'},
 message:{fontWeight:'800',color:'#586a60'},section:{gap:9},sectionTitle:{fontSize:21,fontWeight:'900',color:'#102218'},sectionCopy:{fontSize:13,lineHeight:19,color:'#617068'},card:{backgroundColor:'#fff',borderRadius:18,padding:15,gap:9,borderWidth:1,borderColor:'#dbe5de'},top:{flexDirection:'row',gap:8,alignItems:'flex-start'},cardTitle:{fontSize:17,fontWeight:'900',color:'#102218'},meta:{fontSize:12,lineHeight:18,color:'#65756b'},chips:{flexDirection:'row',flexWrap:'wrap',gap:6},pill:{backgroundColor:'#edf3ef',borderRadius:999,paddingHorizontal:9,paddingVertical:6},pillText:{fontSize:10,fontWeight:'900',color:'#315440'},risk:{borderRadius:999,paddingHorizontal:9,paddingVertical:6},riskHigh:{backgroundColor:'#f3d6d2'},riskMedium:{backgroundColor:'#f5e9c7'},riskLow:{backgroundColor:'#dceede'},riskText:{fontSize:10,fontWeight:'900',color:'#4c4138'},
 warning:{backgroundColor:'#fff4e5',borderWidth:1,borderColor:'#ead2a8',borderRadius:13,padding:11,gap:3},warningTitle:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:'#78521f'},warningText:{fontSize:12,lineHeight:18,color:'#6b593c'},note:{fontSize:12,lineHeight:18,color:'#274b38',fontWeight:'700'},actions:{flexDirection:'row',flexWrap:'wrap',gap:7},action:{backgroundColor:'#173f2d',paddingHorizontal:12,paddingVertical:9,borderRadius:999},danger:{backgroundColor:'#8a3434'},quiet:{backgroundColor:'#e9f0eb'},actionText:{fontSize:11,fontWeight:'900',color:'#fff'},quietText:{color:'#244b37'},disabled:{opacity:.42},
 dnsBox:{backgroundColor:'#f4f8f5',borderRadius:14,padding:12,gap:6,borderWidth:1,borderColor:'#d7e5db'},dnsTitle:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:'#244b37'},code:{fontFamily:'monospace',fontSize:12,color:'#102218',backgroundColor:'#fff',padding:9,borderRadius:8,borderWidth:1,borderColor:'#dbe5de'},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:11,backgroundColor:'#fafcfb',color:'#132b21'},
});
