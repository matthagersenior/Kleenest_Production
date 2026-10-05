import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import {
  getOwnerMailDirectory,grantOwnerMailboxAccess,removeOwnerMailboxAlias,revokeOwnerMailboxAccess,
  saveOwnerMailbox,saveOwnerMailboxAlias,setOwnerMailboxActive,setOwnerMailboxForwarding,
  type OwnerMailbox,type OwnerMailboxAlias,type OwnerMailboxMember,type OwnerMailboxProfile,
} from '../services/communications';

const roles=['owner','manager','responder','viewer'] as const;
const types=['personal','shared','system'] as const;

export default function MailAdmin(){
  const theme=usePlatformTheme();const card=useOSCardStyle();
  const[mailboxes,setMailboxes]=useState<OwnerMailbox[]>([]);
  const[aliases,setAliases]=useState<OwnerMailboxAlias[]>([]);
  const[members,setMembers]=useState<OwnerMailboxMember[]>([]);
  const[profiles,setProfiles]=useState<OwnerMailboxProfile[]>([]);
  const[selectedId,setSelectedId]=useState<string>('');
  const[busy,setBusy]=useState(false);const[notice,setNotice]=useState('');
  const[address,setAddress]=useState('');const[displayName,setDisplayName]=useState('');
  const[mailboxType,setMailboxType]=useState<(typeof types)[number]>('shared');
  const[forwardTargets,setForwardTargets]=useState('');const[keepCopy,setKeepCopy]=useState(true);
  const[aliasAddress,setAliasAddress]=useState('');
  const[memberEmail,setMemberEmail]=useState('');const[memberRole,setMemberRole]=useState<(typeof roles)[number]>('viewer');
  const[canSend,setCanSend]=useState(false);

  const selected=useMemo(()=>mailboxes.find(m=>m.id===selectedId)||null,[mailboxes,selectedId]);
  const selectedAliases=useMemo(()=>aliases.filter(a=>a.mailbox_id===selectedId),[aliases,selectedId]);
  const selectedMembers=useMemo(()=>members.filter(m=>m.mailbox_id===selectedId),[members,selectedId]);
  const profileMap=useMemo(()=>new Map(profiles.map(p=>[p.id,p])),[profiles]);

  async function load(){
    setBusy(true);
    try{
      const data=await getOwnerMailDirectory();
      setMailboxes(data.mailboxes);setAliases(data.aliases);setMembers(data.members);setProfiles(data.profiles);
      const next=selectedId&&data.mailboxes.some(m=>m.id===selectedId)?selectedId:data.mailboxes.find(m=>m.address==='support@kleenest.us')?.id||data.mailboxes[0]?.id||'';
      setSelectedId(next);setNotice('');
    }catch(e:any){setNotice(String(e?.message||'Mail directory could not be loaded.'))}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[]);

  useEffect(()=>{
    if(!selected)return;
    setForwardTargets((selected.forwarding_targets||[]).join(', '));
    setKeepCopy(selected.keep_copy!==false);
  },[selectedId]);

  function editMailbox(m:OwnerMailbox){
    setSelectedId(m.id);setAddress(m.address);setDisplayName(m.display_name);
    setMailboxType((types.includes(m.mailbox_type as any)?m.mailbox_type:'shared') as any);
  }
  function clearMailboxForm(){setAddress('');setDisplayName('');setMailboxType('shared')}

  async function saveMailbox(){
    if(!address.trim())return;
    setBusy(true);
    try{
      const result=await saveOwnerMailbox({address,displayName:displayName||address.split('@')[0],mailboxType,sendEnabled:true,active:true});
      setNotice(result.mailbox.address+' saved.');clearMailboxForm();await load();setSelectedId(result.mailbox.id);
    }catch(e:any){setNotice(String(e?.message||'Mailbox could not be saved.'))}finally{setBusy(false)}
  }

  async function saveForwarding(){
    if(!selected)return;
    setBusy(true);
    try{
      const result=await setOwnerMailboxForwarding({mailboxId:selected.id,enabled:Boolean(forwardTargets.trim()),targets:forwardTargets,keepCopy});
      setNotice(result.mailbox.forwarding_enabled?'Forwarding enabled.':'Forwarding disabled.');await load();
    }catch(e:any){setNotice(String(e?.message||'Forwarding could not be updated.'))}finally{setBusy(false)}
  }

  async function addAlias(){
    if(!selected||!aliasAddress.trim())return;
    setBusy(true);
    try{await saveOwnerMailboxAlias(selected.id,aliasAddress);setAliasAddress('');setNotice('Alias added.');await load()}
    catch(e:any){setNotice(String(e?.message||'Alias could not be added.'))}finally{setBusy(false)}
  }

  async function grantAccess(){
    if(!selected||!memberEmail.trim())return;
    setBusy(true);
    try{
      await grantOwnerMailboxAccess({mailboxId:selected.id,memberEmail,accessRole:memberRole,canSend});
      setMemberEmail('');setMemberRole('viewer');setCanSend(false);setNotice('Mailbox access updated.');await load();
    }catch(e:any){setNotice(String(e?.message||'Mailbox access could not be updated.'))}finally{setBusy(false)}
  }

  return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load()}/>} contentContainerStyle={{padding:16,gap:14,paddingBottom:90,backgroundColor:theme.canvas}}>
    <OSHero eyebrow="KLEENESTOS · MAIL ADMIN" title="Kleenest Mail Directory" body="Create named and shared @kleenest.us addresses, route aliases, assign access, and forward mail to outside inboxes without giving up the Kleenest copy.">
      <StatusPill label={String(mailboxes.length)+' MAILBOXES'} tone="good"/>
      <StatusPill label={String(aliases.length)+' ALIASES'} tone="neutral"/>
    </OSHero>

    {notice?<View style={{...card,borderColor:theme.warning}}><Text style={{fontWeight:'800',color:theme.warning}}>{notice}</Text></View>:null}

    <View style={{...card,gap:10}}>
      <SectionHeader title="Addresses" body="Personal addresses stay distinct from role/shared addresses. System addresses are for automated mail."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {mailboxes.map(m=><Pressable key={m.id} onPress={()=>setSelectedId(m.id)} style={{paddingHorizontal:11,paddingVertical:9,borderRadius:999,backgroundColor:m.id===selectedId?theme.accent:theme.accentSoft,opacity:m.active?1:.55}}>
          <Text style={{fontWeight:'900',color:m.id===selectedId?theme.accentText:theme.accent}}>{m.address}</Text>
        </Pressable>)}
      </View>
      {selected?<View style={{gap:5}}>
        <Text style={{fontWeight:'900',color:theme.ink}}>{selected.display_name}</Text>
        <View style={{flexDirection:'row',gap:6,flexWrap:'wrap'}}>
          <StatusPill label={selected.mailbox_type.toUpperCase()} tone={selected.mailbox_type==='personal'?'warning':'neutral'}/>
          <StatusPill label={selected.send_enabled?'SEND ENABLED':'SEND DISABLED'} tone={selected.send_enabled?'good':'danger'}/>
          <StatusPill label={selected.forwarding_enabled?'FORWARDING ON':'FORWARDING OFF'} tone={selected.forwarding_enabled?'good':'neutral'}/>
          <StatusPill label={selected.active?'ACTIVE':'INACTIVE'} tone={selected.active?'good':'danger'}/>
        </View>
        <Pressable onPress={()=>editMailbox(selected)} style={{alignSelf:'flex-start',padding:9,borderRadius:10,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Edit address</Text></Pressable>
      </View>:null}
    </View>

    <View style={{...card,gap:9}}>
      <SectionHeader title={address?'Create or update address':'Create an address'} body="Enter a local name like matt or a full @kleenest.us address."/>
      <TextInput value={address} onChangeText={setAddress} autoCapitalize="none" placeholder="matt@kleenest.us" placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{types.map(t=><Pressable key={t} onPress={()=>setMailboxType(t)} style={{paddingHorizontal:11,paddingVertical:9,borderRadius:999,backgroundColor:mailboxType===t?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:mailboxType===t?theme.accentText:theme.accent}}>{t}</Text></Pressable>)}</View>
      <View style={{flexDirection:'row',gap:8}}><Pressable disabled={busy||!address.trim()} onPress={()=>void saveMailbox()} style={{padding:11,borderRadius:12,backgroundColor:theme.accent,opacity:busy||!address.trim()?.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>Save mailbox</Text></Pressable><Pressable onPress={clearMailboxForm} style={{padding:11,borderRadius:12,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Clear</Text></Pressable></View>
    </View>

    {selected?<View style={{...card,gap:10}}>
      <SectionHeader title="Forwarding" body="Keep KleenestOS as the system of record while delivering copies to Gmail, Outlook, iCloud, or another inbox."/>
      <TextInput value={forwardTargets} onChangeText={setForwardTargets} autoCapitalize="none" placeholder="person@example.com, second@example.com" placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <Pressable onPress={()=>setKeepCopy(v=>!v)} style={{alignSelf:'flex-start',padding:9,borderRadius:999,backgroundColor:keepCopy?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:keepCopy?theme.accentText:theme.accent}}>{keepCopy?'KEEP KLEENEST COPY':'ARCHIVE AFTER FORWARD'}</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>void saveForwarding()} style={{padding:11,borderRadius:12,backgroundColor:theme.accent}}><Text style={{fontWeight:'900',color:theme.accentText}}>Save forwarding</Text></Pressable>
    </View>:null}

    {selected?<View style={{...card,gap:10}}>
      <SectionHeader title="Aliases" body="Aliases route to this mailbox without creating another mailbox."/>
      {selectedAliases.map(a=><View key={a.alias_address} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}><Text style={{fontWeight:'800',color:theme.ink}}>{a.alias_address}</Text><Pressable onPress={async()=>{setBusy(true);try{await removeOwnerMailboxAlias(a.alias_address);await load()}catch(e:any){setNotice(String(e?.message||e))}finally{setBusy(false)}}} style={{padding:8,borderRadius:10,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.danger}}>Remove</Text></Pressable></View>)}
      <View style={{flexDirection:'row',gap:8}}><TextInput value={aliasAddress} onChangeText={setAliasAddress} autoCapitalize="none" placeholder="contact@kleenest.us" placeholderTextColor={theme.muted} style={{flex:1,borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/><Pressable onPress={()=>void addAlias()} style={{padding:11,borderRadius:12,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Add</Text></Pressable></View>
    </View>:null}

    {selected?<View style={{...card,gap:10}}>
      <SectionHeader title="Access" body="Grant qualified Kleenest accounts mailbox roles. Responder and higher can be allowed to send."/>
      {selectedMembers.map(m=>{const p=profileMap.get(m.user_id);return <View key={m.user_id} style={{gap:4,borderBottomWidth:1,borderColor:theme.line,paddingBottom:8}}>
        <Text style={{fontWeight:'900',color:theme.ink}}>{p?.display_name||p?.username||m.user_id.slice(0,8)}</Text>
        <Text style={{fontSize:12,color:theme.muted}}>{m.access_role} · {m.can_send?'can send':'read only'}</Text>
        <Pressable onPress={async()=>{setBusy(true);try{await revokeOwnerMailboxAccess(selected.id,m.user_id);await load()}catch(e:any){setNotice(String(e?.message||e))}finally{setBusy(false)}}} style={{alignSelf:'flex-start',padding:7,borderRadius:9,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.danger}}>Revoke</Text></Pressable>
      </View>})}
      <TextInput value={memberEmail} onChangeText={setMemberEmail} autoCapitalize="none" placeholder="Kleenest account email" placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <View style={{flexDirection:'row',gap:7,flexWrap:'wrap'}}>{roles.map(r=><Pressable key={r} onPress={()=>setMemberRole(r)} style={{paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:memberRole===r?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:memberRole===r?theme.accentText:theme.accent}}>{r}</Text></Pressable>)}</View>
      <Pressable onPress={()=>setCanSend(v=>!v)} style={{alignSelf:'flex-start',padding:9,borderRadius:999,backgroundColor:canSend?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:canSend?theme.accentText:theme.accent}}>{canSend?'CAN SEND':'READ ONLY'}</Text></Pressable>
      <Pressable disabled={busy||!memberEmail.trim()} onPress={()=>void grantAccess()} style={{padding:11,borderRadius:12,backgroundColor:theme.accent,opacity:busy||!memberEmail.trim()?.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>Grant access</Text></Pressable>
    </View>:null}

    {selected?<View style={{...card,gap:8}}>
      <SectionHeader title="Mailbox lifecycle" body="Inactive addresses stop receiving through the managed directory without deleting history."/>
      <Pressable onPress={async()=>{setBusy(true);try{await setOwnerMailboxActive(selected.id,!selected.active);setNotice(selected.active?'Mailbox deactivated.':'Mailbox activated.');await load()}catch(e:any){setNotice(String(e?.message||e))}finally{setBusy(false)}}} style={{padding:11,borderRadius:12,backgroundColor:selected.active?theme.accentSoft:theme.accent}}><Text style={{fontWeight:'900',color:selected.active?theme.danger:theme.accentText}}>{selected.active?'Deactivate mailbox':'Activate mailbox'}</Text></Pressable>
    </View>:null}
  </ScrollView>;
}
