import { useEffect,useMemo,useState } from 'react';
import { Linking,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import {
  applyDeveloperBundle,createDeveloperPartner,createDeveloperWebhook,disableDeveloperWebhook,
  getDeveloperBundles,getDeveloperPartnerDetail,getDeveloperPartners,inviteDeveloperMember,
  issueDeveloperApiKey,issueDeveloperBrowserToken,revokeDeveloperCredential,setDeveloperPartnerBilling,
  updateDeveloperMember,updateDeveloperPartner,
  type DeveloperBundle,type DeveloperPartner,type DeveloperPartnerDetail
} from '../services/developerPartners';

const apiProducts=['nearby','route','place_details','place_match'] as const;
const surfaces=['rest','sdk','widget','map','route_sdk','webhooks','mcp'] as const;
const scopeOptions=['recommendations:read','platform:read'] as const;
const roles=['owner','admin','developer'] as const;
const pretty=(v:unknown)=>String(v??'').replaceAll('_',' ').replaceAll('-',' ');

export default function DeveloperPartners(){
  const[partners,setPartners]=useState<DeveloperPartner[]>([]),[bundles,setBundles]=useState<DeveloperBundle[]>([]),[selectedId,setSelectedId]=useState(''),[detail,setDetail]=useState<DeveloperPartnerDetail|null>(null);
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading developer partners…'),[secret,setSecret]=useState('');
  const[newName,setNewName]=useState(''),[newSlug,setNewSlug]=useState(''),[newBundle,setNewBundle]=useState('starter_api');
  const[quotaMinute,setQuotaMinute]=useState(''),[quotaMonth,setQuotaMonth]=useState(''),[notes,setNotes]=useState('');
  const[inviteEmail,setInviteEmail]=useState(''),[inviteRole,setInviteRole]=useState<'owner'|'admin'|'developer'>('developer');
  const[keyLabel,setKeyLabel]=useState('Integration key'),[browserLabel,setBrowserLabel]=useState('Browser token'),[browserOrigin,setBrowserOrigin]=useState(''),[browserDays,setBrowserDays]=useState('7'),[browserQuota,setBrowserQuota]=useState('30');
  const[webhookUrl,setWebhookUrl]=useState(''),[webhookEvents,setWebhookEvents]=useState('place.updated,place.verification_changed');
  const[billingProvider,setBillingProvider]=useState('manual'),[billingStatus,setBillingStatus]=useState('inactive'),[billingPlan,setBillingPlan]=useState('developer'),[billingCustomer,setBillingCustomer]=useState(''),[billingSubscription,setBillingSubscription]=useState('');

  async function loadDirectory(preferred?:string){
    setBusy(true);
    try{
      const[p,b]=await Promise.all([getDeveloperPartners(),getDeveloperBundles()]);
      setPartners(p);setBundles(b);
      const id=preferred||selectedId||p[0]?.id||'';
      setSelectedId(id);
      if(id)await loadDetail(id,false);else setDetail(null);
      setMessage('');
    }catch(e:any){setMessage(e?.message||'Developer Platform unavailable.')}
    finally{setBusy(false);}
  }
  async function loadDetail(id:string,manageBusy=true){
    if(manageBusy)setBusy(true);
    try{
      const d=await getDeveloperPartnerDetail(id);setDetail(d);
      setQuotaMinute(String(d.partner.quota_per_minute));setQuotaMonth(String(d.partner.quota_per_month));
      setNotes(d.product_access?.owner_notes??'');
      setBillingProvider(d.billing?.provider??'manual');setBillingStatus(d.billing?.status??'inactive');
      setBillingPlan(d.billing?.plan_code??d.partner.plan??'developer');
      setBillingCustomer(d.billing?.external_customer_id??'');setBillingSubscription(d.billing?.external_subscription_id??'');
      setMessage('');
    }catch(e:any){setMessage(e?.message||'Partner detail unavailable.')}
    finally{if(manageBusy)setBusy(false);}
  }
  useEffect(()=>{void loadDirectory();},[]);
  async function run(label:string,work:()=>Promise<unknown>,reload=true){
    setBusy(true);setSecret('');
    try{
      const result:any=await work();
      if(result?.api_key)setSecret(result.api_key);
      if(result?.client_token)setSecret(result.client_token);
      if(result?.invite_token)setSecret(result.invite_token);
      if(result?.signing_secret)setSecret(result.signing_secret);
      setMessage(label);
      if(reload&&selectedId)await loadDirectory(selectedId);
      return result;
    }catch(e:any){setMessage(e?.message||'Developer Platform update failed.');}
    finally{setBusy(false);}
  }

  async function createPartner(){
    if(!newName.trim()||!newSlug.trim()){setMessage('Partner name and slug are required.');return;}
    const result:any=await run('Partner workspace created.',()=>createDeveloperPartner({name:newName.trim(),slug:newSlug.trim().toLowerCase(),bundleKey:newBundle}),false);
    if(result){setNewName('');setNewSlug('');await loadDirectory(String(result));}
  }
  async function createDemoPartner(){
    const stamp=Date.now().toString(36);
    const result:any=await run(
      'Demo workspace created. Open the Developer Portal to launch its one-hour sandbox.',
      ()=>createDeveloperPartner({
        name:'Kleenest Demo '+new Date().toLocaleDateString(),
        slug:'kleenest-demo-'+stamp,
        bundleKey:'starter_api'
      }),
      false
    );
    if(result)await loadDirectory(String(result));
  }
  async function patch(patchValue:Record<string,unknown>,label:string){
    if(!selectedId)return;
    await run(label,()=>updateDeveloperPartner(selectedId,patchValue,label));
  }

  const access=detail?.product_access;
  const usagePct=detail&&detail.partner.quota_per_month?Math.min(100,Math.round((Number(detail.month_usage?.request_count||0)/detail.partner.quota_per_month)*100)):0;
  const currentBundle=access?.bundle_key??'custom';
  const activeKeys=detail?.api_keys.filter(k=>!k.revoked_at)??[];
  const activeHooks=detail?.webhooks.filter(w=>w.active)??[];
  const sortedPartners=useMemo(()=>[...partners].sort((a,b)=>a.name.localeCompare(b.name)),[partners]);

  return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>loadDirectory(selectedId)}/>} contentContainerStyle={s.page}>
    <View style={s.hero}><Text style={s.eyebrow}>KLEENESTOS · DEVELOPER PLATFORM</Text><Text style={s.title}>Developer Platform → Partners</Text><Text style={s.copy}>Create a customer workspace, choose a sellable product bundle, customize API products and quotas, manage team access and credentials, and suspend access from one owner surface.</Text></View>
    {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
    {secret?<View style={s.secret}><Text style={s.secretTitle}>One-time secret / invite</Text><Text selectable style={s.secretText}>{secret}</Text><Text style={s.meta}>Copy this now. Kleenest does not display the raw value again.</Text></View>:null}

    <View style={s.section}>
      <Text style={s.sectionTitle}>Developer experience</Text>
      <Text style={s.meta}>The external portal now guides a partner from account and workspace access through a one-hour origin-bound sandbox, live API Playground, code generation, sample integrations, and production credentials.</Text>
      <View style={s.two}>
        <Pressable onPress={()=>void Linking.openURL('https://matthagersenior.github.io/Kleenest_Production/developer/')} style={[s.button,{flex:1}]}><Text style={s.buttonText}>Open Developer Portal</Text></Pressable>
        <Pressable disabled={busy} onPress={()=>void createDemoPartner()} style={[s.primary,{flex:1},busy&&s.disabled]}><Text style={s.primaryText}>Launch Demo Workspace</Text></Pressable>
      </View>
      <Text style={s.meta}>Demo workspaces use Starter API defaults. The portal sandbox credential is not persisted in the browser and expires after one hour.</Text>
    </View>

    <View style={s.section}>
      <Text style={s.sectionTitle}>Create partner workspace</Text>
      <TextInput value={newName} onChangeText={setNewName} placeholder="Customer / partner name" style={s.input}/>
      <TextInput value={newSlug} onChangeText={setNewSlug} autoCapitalize="none" placeholder="partner-slug" style={s.input}/>
      <Text style={s.label}>Product bundle</Text>
      <View style={s.chips}>{bundles.map(b=><Chip key={b.bundle_key} text={b.label} on={newBundle===b.bundle_key} onPress={()=>setNewBundle(b.bundle_key)}/>)}</View>
      <Pressable disabled={busy} onPress={()=>void createPartner()} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>Create Partner</Text></Pressable>
    </View>

    <View style={s.section}><Text style={s.sectionTitle}>Partner workspaces</Text><Text style={s.meta}>{partners.length} total · tap one to manage everything.</Text><View style={s.chips}>{sortedPartners.map(p=><Chip key={p.id} text={p.name} on={selectedId===p.id} onPress={()=>{setSelectedId(p.id);void loadDetail(p.id);}}/>)}</View></View>

    {!detail?null:<>
      <View style={s.card}>
        <View style={s.row}><View style={{flex:1}}><Text style={s.cardTitle}>{detail.partner.name}</Text><Text style={s.meta}>{detail.partner.slug} · {pretty(detail.partner.plan)} · {pretty(detail.partner.status)}</Text></View><Status text={detail.partner.status.toUpperCase()} good={detail.partner.status==='active'}/></View>
        <View style={s.metrics}><Metric label="Month requests" value={String(detail.month_usage?.request_count??0)}/><Metric label="Monthly limit" value={String(detail.partner.quota_per_month)}/><Metric label="Active keys" value={String(activeKeys.length)}/><Metric label="Webhooks" value={String(activeHooks.length)}/></View>
        <Text style={s.meta}>{usagePct}% of monthly quota used.</Text>
        <Pressable onPress={()=>void patch({status:detail.partner.status==='active'?'suspended':'active'},detail.partner.status==='active'?'Partner suspended.':'Partner reactivated.')} style={[s.button,detail.partner.status==='active'&&s.danger]}><Text style={s.buttonText}>{detail.partner.status==='active'?'Suspend partner':'Reactivate partner'}</Text></Pressable>
      </View>

      <View style={s.section}><Text style={s.sectionTitle}>Product bundle</Text><Text style={s.meta}>Applying a bundle resets plan, default quotas, scopes, API products and integration surfaces. You can override any of those afterward.</Text><View style={s.chips}>{detail.bundles.map(b=><Chip key={b.bundle_key} text={b.label} on={currentBundle===b.bundle_key} onPress={()=>void run(b.label+' applied.',()=>applyDeveloperBundle(selectedId,b.bundle_key))}/>)}</View>{currentBundle==='custom'?<Text style={s.warning}>CUSTOM: this partner has owner overrides beyond a standard bundle.</Text>:null}</View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>API products</Text><Text style={s.meta}>These are enforced at request authorization—not merely hidden in the portal.</Text>
        <View style={s.chips}>{apiProducts.map(v=><Chip key={v} text={pretty(v)} on={Boolean(access?.api_products?.includes(v))} onPress={()=>{const next=new Set(access?.api_products??[]);next.has(v)?next.delete(v):next.add(v);void patch({api_products:[...next]},'API product access updated.');}}/>)}</View>
        <Text style={s.label}>Integration surfaces</Text><View style={s.chips}>{surfaces.map(v=><Chip key={v} text={pretty(v)} on={Boolean(access?.integration_surfaces?.includes(v))} onPress={()=>{const next=new Set(access?.integration_surfaces??[]);next.has(v)?next.delete(v):next.add(v);void patch({integration_surfaces:[...next]},'Integration surfaces updated.');}}/>)}</View>
        <Text style={s.label}>Allowed scopes</Text><View style={s.chips}>{scopeOptions.map(v=><Chip key={v} text={v} on={Boolean(access?.scopes?.includes(v))} onPress={()=>{const next=new Set(access?.scopes??[]);next.has(v)?next.delete(v):next.add(v);void patch({scopes:[...next]},'Partner scope ceiling updated.');}}/>)}</View>
      </View>

      <View style={s.section}><Text style={s.sectionTitle}>Per minute / Per month limits</Text><View style={s.two}><TextInput value={quotaMinute} onChangeText={setQuotaMinute} keyboardType="number-pad" placeholder="Per minute" style={[s.input,{flex:1}]}/><TextInput value={quotaMonth} onChangeText={setQuotaMonth} keyboardType="number-pad" placeholder="Per month" style={[s.input,{flex:1}]}/></View><TextInput value={notes} onChangeText={setNotes} placeholder="Owner notes" multiline style={[s.input,{minHeight:70}]}/><Pressable onPress={()=>void patch({quota_per_minute:Number(quotaMinute),quota_per_month:Number(quotaMonth),owner_notes:notes},'Quota and owner notes updated.')} style={s.button}><Text style={s.buttonText}>Save Custom Limits</Text></Pressable></View>

      <View style={s.section}><Text style={s.sectionTitle}>Pilot linkage</Text><Text style={s.meta}>Tie this customer workspace to a named pilot or leave it unlinked for production access.</Text><View style={s.chips}><Chip text="No pilot" on={!access?.pilot_session_id} onPress={()=>void patch({pilot_session_id:null},'Pilot link cleared.')}/>{detail.available_pilots.map(p=><Chip key={p.id} text={p.name+' · '+pretty(p.status)} on={access?.pilot_session_id===p.id} onPress={()=>void patch({pilot_session_id:p.id},'Partner linked to pilot session.')}/>)}</View></View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Team access</Text><Text style={s.meta}>Invite customer developers or change/remove existing workspace roles.</Text>
        <TextInput value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" placeholder="developer@customer.com" style={s.input}/>
        <View style={s.chips}>{roles.map(r=><Chip key={r} text={r} on={inviteRole===r} onPress={()=>setInviteRole(r)}/>)}</View>
        <Pressable onPress={()=>void run('Developer invitation created.',async()=>{const v=await inviteDeveloperMember(selectedId,inviteEmail.trim(),inviteRole);setInviteEmail('');return v;})} style={s.button}><Text style={s.buttonText}>Create Invitation</Text></Pressable>
        {detail.members.map(m=><View key={m.user_id} style={s.listRow}><View><Text style={s.rowTitle}>{m.email||m.user_id}</Text><Text style={s.meta}>Joined {new Date(m.joined_at).toLocaleDateString()}</Text></View><View style={s.chips}>{roles.map(r=><Chip key={r} text={r} on={m.role===r} onPress={()=>void run('Member role updated.',()=>updateDeveloperMember(selectedId,m.user_id,r))}/>)}</View><Pressable onPress={()=>void run('Member removed.',()=>updateDeveloperMember(selectedId,m.user_id,null))} style={s.dangerSmall}><Text style={s.dangerText}>Remove</Text></Pressable></View>)}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Credentials & origins</Text><Text style={s.meta}>Server keys use the partner scope ceiling. Browser tokens are origin-bound, expiring and separately rate-limited.</Text>
        <TextInput value={keyLabel} onChangeText={setKeyLabel} placeholder="Server key label" style={s.input}/><Pressable onPress={()=>void run('Server API key issued.',()=>issueDeveloperApiKey(selectedId,keyLabel,access?.scopes??['recommendations:read']))} style={s.button}><Text style={s.buttonText}>Issue Server API Key</Text></Pressable>
        <TextInput value={browserLabel} onChangeText={setBrowserLabel} placeholder="Browser token label" style={s.input}/><TextInput value={browserOrigin} onChangeText={setBrowserOrigin} autoCapitalize="none" placeholder="https://app.customer.com" style={s.input}/>
        <View style={s.two}><TextInput value={browserDays} onChangeText={setBrowserDays} keyboardType="number-pad" placeholder="Days" style={[s.input,{flex:1}]}/><TextInput value={browserQuota} onChangeText={setBrowserQuota} keyboardType="number-pad" placeholder="Per-minute cap" style={[s.input,{flex:1}]}/></View>
        <Pressable onPress={()=>void run('Browser token issued.',()=>issueDeveloperBrowserToken(selectedId,browserLabel,[browserOrigin.trim()],new Date(Date.now()+Math.max(1,Math.min(30,Number(browserDays)||7))*86400000).toISOString(),Math.max(1,Number(browserQuota)||30)))} style={s.button}><Text style={s.buttonText}>Issue Browser Token</Text></Pressable>
        {detail.api_keys.map(k=><View key={k.id} style={s.listRow}><View><Text style={s.rowTitle}>{k.label} · {k.credential_type}</Text><Text style={s.meta}>{k.key_prefix} · {k.scopes.join(', ')}</Text>{k.allowed_origins?.length?<Text style={s.meta}>{k.allowed_origins.join(', ')}</Text>:null}<Text style={s.meta}>{k.revoked_at?'REVOKED':'Last used '+(k.last_used_at?new Date(k.last_used_at).toLocaleString():'never')}</Text></View>{!k.revoked_at?<Pressable onPress={()=>void run('Credential revoked.',()=>revokeDeveloperCredential(selectedId,k.id))} style={s.dangerSmall}><Text style={s.dangerText}>Revoke</Text></Pressable>:null}</View>)}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Webhooks</Text><TextInput value={webhookUrl} onChangeText={setWebhookUrl} autoCapitalize="none" placeholder="https://customer.com/webhooks/kleenest" style={s.input}/><TextInput value={webhookEvents} onChangeText={setWebhookEvents} placeholder="place.updated,place.verification_changed" style={s.input}/>
        <Pressable onPress={()=>void run('Webhook created.',()=>createDeveloperWebhook(selectedId,webhookUrl.trim(),'Kleenest webhook',webhookEvents.split(',').map(v=>v.trim()).filter(Boolean)))} style={s.button}><Text style={s.buttonText}>Create Webhook</Text></Pressable>
        {detail.webhooks.map(w=><View key={w.id} style={s.listRow}><View><Text style={s.rowTitle}>{w.label} · {w.active?'ACTIVE':'DISABLED'}</Text><Text style={s.meta}>{w.url}</Text><Text style={s.meta}>{w.event_types.join(', ')} · failures {w.consecutive_failures}</Text></View>{w.active?<Pressable onPress={()=>void run('Webhook disabled.',()=>disableDeveloperWebhook(selectedId,w.id))} style={s.dangerSmall}><Text style={s.dangerText}>Disable</Text></Pressable>:null}</View>)}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Billing</Text><View style={s.chips}>{['manual','stripe','shopify','other'].map(v=><Chip key={v} text={v} on={billingProvider===v} onPress={()=>setBillingProvider(v)}/>)}</View>
        <TextInput value={billingStatus} onChangeText={setBillingStatus} placeholder="subscription status" style={s.input}/><TextInput value={billingPlan} onChangeText={setBillingPlan} placeholder="plan code" style={s.input}/><TextInput value={billingCustomer} onChangeText={setBillingCustomer} placeholder="external customer id" style={s.input}/><TextInput value={billingSubscription} onChangeText={setBillingSubscription} placeholder="external subscription id" style={s.input}/>
        <Pressable onPress={()=>void run('Billing state updated.',()=>setDeveloperPartnerBilling(selectedId,{provider:billingProvider,status:billingStatus,planCode:billingPlan||null,externalCustomerId:billingCustomer||null,externalSubscriptionId:billingSubscription||null}))} style={s.button}><Text style={s.buttonText}>Save Billing</Text></Pressable>
      </View>

      <View style={s.section}><Text style={s.sectionTitle}>Audit trail</Text><Text style={s.meta}>Owner changes to bundle, products, quotas, team, credentials, webhooks and billing are retained here.</Text>{detail.control_log.length===0?<Text style={s.meta}>No owner control events recorded yet.</Text>:detail.control_log.map(a=><View key={a.id} style={s.audit}><Text style={s.rowTitle}>{pretty(a.action)}</Text><Text style={s.meta}>{new Date(a.created_at).toLocaleString()} · {a.reason||'No reason recorded'}</Text></View>)}</View>
    </>}
  </ScrollView>;
}

function Metric({label,value}:{label:string;value:string}){return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.meta}>{label}</Text></View>}
function Status({text,good}:{text:string;good:boolean}){return <View style={[s.status,good?s.good:s.bad]}><Text style={s.statusText}>{text}</Text></View>}
function Chip({text,on,onPress}:{text:string;on:boolean;onPress:()=>void}){return <Pressable onPress={onPress} style={[s.chip,on&&s.chipOn]}><Text style={[s.chipText,on&&s.chipTextOn]}>{text}</Text></Pressable>}
const s=StyleSheet.create({
  page:{padding:18,gap:14,paddingBottom:90,backgroundColor:'#f3f6f4'},hero:{backgroundColor:'#0c2017',padding:19,borderRadius:23,gap:7},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#a8d3ba'},title:{fontSize:27,fontWeight:'900',color:'#fff'},copy:{color:'#d9e8df',lineHeight:20},message:{fontWeight:'800',color:'#554e39'},
  secret:{backgroundColor:'#fff4c8',borderWidth:1,borderColor:'#d8bf5c',padding:13,borderRadius:14,gap:5},secretTitle:{fontWeight:'900',color:'#604d00'},secretText:{fontFamily:'monospace',color:'#3c330c'},
  section:{backgroundColor:'#fff',padding:14,borderRadius:17,borderWidth:1,borderColor:'#dbe5de',gap:9},sectionTitle:{fontSize:20,fontWeight:'900',color:'#102218'},card:{backgroundColor:'#fff',padding:15,borderRadius:18,borderWidth:1,borderColor:'#dbe5de',gap:10},cardTitle:{fontSize:18,fontWeight:'900',color:'#102218'},meta:{fontSize:12,lineHeight:18,color:'#66766e'},label:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:'#718077',textTransform:'uppercase'},
  input:{backgroundColor:'#f9fbfa',borderWidth:1,borderColor:'#ccd9d1',borderRadius:12,padding:11},row:{flexDirection:'row',alignItems:'flex-start',gap:8},two:{flexDirection:'row',gap:8},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{borderWidth:1,borderColor:'#cbd8d0',borderRadius:999,paddingHorizontal:10,paddingVertical:7,backgroundColor:'#fff'},chipOn:{backgroundColor:'#173f2d',borderColor:'#173f2d'},chipText:{fontSize:11,fontWeight:'800',color:'#42574b'},chipTextOn:{color:'#fff'},
  primary:{backgroundColor:'#173f2d',borderRadius:12,paddingVertical:12,paddingHorizontal:14,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},button:{backgroundColor:'#edf3ef',borderRadius:11,paddingVertical:10,paddingHorizontal:12,alignItems:'center'},buttonText:{fontWeight:'900',color:'#234a36'},disabled:{opacity:.45},danger:{backgroundColor:'#f8dedb'},dangerSmall:{backgroundColor:'#f8dedb',borderRadius:10,paddingHorizontal:10,paddingVertical:8},dangerText:{color:'#7d2d27',fontWeight:'900'},
  metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{minWidth:'46%',flexGrow:1,backgroundColor:'#f8fbf9',padding:12,borderRadius:14},metricValue:{fontSize:20,fontWeight:'900',color:'#173f2d'},status:{paddingHorizontal:8,paddingVertical:5,borderRadius:999},statusText:{fontSize:9,fontWeight:'900',color:'#244333'},good:{backgroundColor:'#dff2e6'},bad:{backgroundColor:'#f6deda'},warning:{color:'#805d00',fontWeight:'900'},
  listRow:{borderTopWidth:1,borderTopColor:'#e5ece8',paddingTop:10,gap:7},rowTitle:{fontSize:13,fontWeight:'900',color:'#102218'},audit:{borderTopWidth:1,borderTopColor:'#e5ece8',paddingTop:9}
});
