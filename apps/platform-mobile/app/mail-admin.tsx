import { useEffect,useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator,Pressable,ScrollView,Text,TextInput,View } from 'react-native';
import { OSHero,SectionHeader,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import { getOwnerAuthorization } from '../services/ownerAdmin';
import { searchOwnerUsers } from '../services/ownerAdmin';
import { listManagedMailboxes,manageMailDirectory,type ManagedMailbox } from '../services/communications';

type Role='viewer'|'responder'|'manager'|'owner';
const roles:Role[]=['viewer','responder','manager','owner'];
const initialSettings={
  displayName:'',sendEnabled:true,active:true,forwardingEnabled:false,forwardingTargets:'',
  keepCopy:true,signatureText:'',autoReplyEnabled:false,autoReplySubject:'',autoReplyBody:'',
};
type Settings=typeof initialSettings;
function settingsOf(m:ManagedMailbox):Settings{
  return {displayName:m.display_name,sendEnabled:m.send_enabled,active:m.active,
    forwardingEnabled:m.forwarding_enabled,forwardingTargets:(m.forwarding_targets||[]).join(', '),
    keepCopy:m.keep_copy,signatureText:m.signature_text||'',autoReplyEnabled:m.auto_reply_enabled,
    autoReplySubject:m.auto_reply_subject||'',autoReplyBody:m.auto_reply_body||''};
}
export default function MailboxManagement(){
  const router=useRouter(),theme=usePlatformTheme(),card=useOSCardStyle();
  const[authorized,setAuthorized]=useState<boolean|null>(null);
  const[mailboxes,setMailboxes]=useState<ManagedMailbox[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const[creating,setCreating]=useState(false),[newAddress,setNewAddress]=useState(''),[newName,setNewName]=useState(''),[newType,setNewType]=useState<'shared'|'personal'>('shared');
  const[settings,setSettings]=useState<Settings>(initialSettings),[alias,setAlias]=useState('');
  const[userSearch,setUserSearch]=useState(''),[userRows,setUserRows]=useState<any[]>([]),[targetUserId,setTargetUserId]=useState(''),[targetUserLabel,setTargetUserLabel]=useState('');
  const[memberRole,setMemberRole]=useState<Role>('responder'),[canSend,setCanSend]=useState(true);
  const selected=mailboxes.find(m=>m.id===selectedId);
  async function refresh(){
    const {mailboxes:rows}=await listManagedMailboxes();setMailboxes(rows);
  }
  useEffect(()=>{
    let alive=true;
    getOwnerAuthorization().then(async value=>{
      if(!alive)return;
      setAuthorized(value.is_platform_owner);
      if(value.is_platform_owner)await refresh();
    }).catch(e=>{if(alive)setError(String(e?.message||e))});
    return()=>{alive=false};
  },[]);
  function choose(m:ManagedMailbox){setSelectedId(m.id);setSettings(settingsOf(m));setCreating(false);setAlias('');setError('');setNotice('')}
  async function run(action:string,payload:Record<string,unknown>,success:string){
    setBusy(true);setError('');setNotice('');
    try{await manageMailDirectory(action,payload);await refresh();setNotice(success)}
    catch(e:any){setError(String(e?.message||'Mailbox action failed.'))}
    finally{setBusy(false)}
  }
  async function findUsers(){
    if(!userSearch.trim())return;
    setBusy(true);setError('');
    try{setUserRows(await searchOwnerUsers(userSearch))}
    catch(e:any){setError(String(e?.message||e))}
    finally{setBusy(false)}
  }
  function pickUser(user:any){
    const id=String(user.id||'');if(!id)return;
    setTargetUserId(id);setTargetUserLabel(String(user.display_name||user.username||user.email||id));
  }
  const field=(label:string,value:string,onChange:(next:string)=>void,multiline=false)=>(
    <View style={{gap:5}}><Text style={{fontSize:12,fontWeight:'800',color:theme.ink}}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} placeholderTextColor={theme.muted}
        style={{borderRadius:12,borderWidth:1,borderColor:theme.line,backgroundColor:theme.surfaceRaised,color:theme.ink,padding:12,minHeight:multiline?85:undefined}}/>
    </View>
  );
  const actionButton=(label:string,onPress:()=>void,disabled=false,danger=false)=>(
    <Pressable accessibilityRole="button" disabled={disabled||busy} onPress={onPress}
      style={{paddingHorizontal:13,paddingVertical:11,borderRadius:12,backgroundColor:danger?theme.danger:theme.accent,opacity:disabled||busy?0.45:1}}>
      <Text style={{fontWeight:'900',color:theme.accentText}}>{label}</Text>
    </Pressable>
  );
  const toggle=(label:string,value:boolean,onChange:(next:boolean)=>void)=>(
    <Pressable accessibilityRole="switch" accessibilityState={{checked:value}} onPress={()=>onChange(!value)}
      style={{padding:11,borderRadius:12,borderWidth:1,borderColor:theme.line,backgroundColor:value?theme.accentSoft:theme.surfaceRaised,flexDirection:'row',justifyContent:'space-between'}}>
      <Text style={{fontWeight:'800',color:theme.ink}}>{label}</Text>
      <Text style={{fontWeight:'900',color:theme.accent}}>{value?'On':'Off'}</Text>
    </Pressable>
  );
  return <ScrollView contentContainerStyle={{padding:16,paddingBottom:70,gap:14,backgroundColor:theme.canvas}}>
    <OSHero eyebrow="KLEENESTOS · EMAIL" title="Mailbox Management" body="Create domain addresses, manage aliases and forwarding, and grant scoped access to existing Kleenest users."/>
    <Pressable onPress={()=>router.push('/communications')}><Text style={{color:theme.accent,fontWeight:'900'}}>← Return to Email Center</Text></Pressable>
    {error?<View style={{...card,borderColor:theme.danger}}><Text style={{color:theme.danger}}>{error}</Text></View>:null}
    {notice?<View style={card}><Text style={{color:theme.success,fontWeight:'800'}}>{notice}</Text></View>:null}
    {authorized===null?<ActivityIndicator/>:authorized===false?<View style={card}><Text style={{color:theme.ink}}>Platform-owner permission is required to manage mailboxes. Assigned mail users can access only their own mail.</Text></View>:<>
      <View style={{...card,gap:10}}>
        <SectionHeader title="Domain mailboxes" body="Inactive mailboxes remain in the directory; deletion is a reversible deactivation."/>
        <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
          {actionButton(creating?'Cancel new mailbox':'Create mailbox',()=>{setCreating(v=>!v);setSelectedId('');})}
          {actionButton('Refresh',()=>{void refresh()},false)}
        </View>
        {mailboxes.map(m=><Pressable key={m.id} onPress={()=>choose(m)}
          style={{padding:11,borderWidth:1,borderRadius:13,borderColor:selectedId===m.id?theme.accent:theme.line,backgroundColor:theme.surfaceRaised}}>
          <Text style={{fontWeight:'900',color:theme.ink}}>{m.address}</Text>
          <Text style={{fontSize:12,color:theme.muted}}>{m.mailbox_type} · {m.active?'Active':'Inactive'} · {m.members.length} member(s) · {m.aliases.filter(a=>a.active).length} alias(es)</Text>
        </Pressable>)}
      </View>
      {creating?<View style={{...card,gap:10}}>
        <SectionHeader title="Create a mailbox" body="Addresses must end in @kleenest.us. Personal addresses require a specific account owner."/>
        {field('New email address',newAddress,setNewAddress)}
        {field('Display name',newName,setNewName)}
        <View style={{flexDirection:'row',gap:8}}>{(['shared','personal'] as const).map(t=><Pressable key={t} onPress={()=>setNewType(t)} style={{backgroundColor:newType===t?theme.accent:theme.accentSoft,padding:10,borderRadius:11}}><Text style={{color:newType===t?theme.accentText:theme.accent,fontWeight:'800'}}>{t}</Text></Pressable>)}</View>
        {newType==='personal'?<Text style={{color:theme.muted,fontSize:12}}>Select the person's Kleenest account in Account lookup below before creating.</Text>:null}
        {actionButton('Create @kleenest.us mailbox',()=>{void run('create_mailbox',{address:newAddress,displayName:newName,mailboxType:newType,ownerUserId:newType==='personal'?targetUserId:undefined},'Mailbox created.');setCreating(false)},!newAddress.trim()||(newType==='personal'&&!targetUserId))}
      </View>:null}
      {selected&&selected.mailbox_type!=='system'?<View style={{...card,gap:12}}>
        <SectionHeader title={'Settings · '+selected.address} body="Apply settings, or deactivate an address without deleting its history."/>
        {field('Display name',settings.displayName,v=>setSettings(s=>({...s,displayName:v})))}
        {toggle('Sending enabled',settings.sendEnabled,v=>setSettings(s=>({...s,sendEnabled:v})))}
        {toggle('Mailbox active',settings.active,v=>setSettings(s=>({...s,active:v})))}
        {field('Email signature',settings.signatureText,v=>setSettings(s=>({...s,signatureText:v})),true)}
        {toggle('Forward incoming mail',settings.forwardingEnabled,v=>setSettings(s=>({...s,forwardingEnabled:v})))}
        {settings.forwardingEnabled?field('Forwarding addresses (comma separated)',settings.forwardingTargets,v=>setSettings(s=>({...s,forwardingTargets:v}))):null}
        {settings.forwardingEnabled?toggle('Keep copy in Kleenest Mail',settings.keepCopy,v=>setSettings(s=>({...s,keepCopy:v}))):null}
        {toggle('Automatic reply',settings.autoReplyEnabled,v=>setSettings(s=>({...s,autoReplyEnabled:v})))}
        {settings.autoReplyEnabled?<>{field('Auto-reply subject',settings.autoReplySubject,v=>setSettings(s=>({...s,autoReplySubject:v})))}{field('Auto-reply message',settings.autoReplyBody,v=>setSettings(s=>({...s,autoReplyBody:v})),true)}</>:null}
        {actionButton('Save mailbox settings',()=>void run('update_mailbox',{mailboxId:selected.id,displayName:settings.displayName,sendEnabled:settings.sendEnabled,active:settings.active,
          forwardingEnabled:settings.forwardingEnabled,forwardingTargets:settings.forwardingTargets.split(',').map(x=>x.trim()).filter(Boolean),
          keepCopy:settings.keepCopy,signatureText:settings.signatureText,autoReplyEnabled:settings.autoReplyEnabled,
          autoReplySubject:settings.autoReplySubject,autoReplyBody:settings.autoReplyBody},'Mailbox settings saved.'),!settings.displayName.trim())}
        <SectionHeader title="Aliases" body="Deliver more addresses into this mailbox without creating additional logins."/>
        {selected.aliases.map(a=><View key={a.alias_address} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
          <Text style={{flex:1,color:theme.ink}}>{a.alias_address} {a.active?'':'(inactive)'}</Text>
          {a.active?actionButton('Disable',()=>void run('remove_alias',{mailboxId:selected.id,alias:a.alias_address},'Alias disabled.')):actionButton('Restore',()=>void run('add_alias',{mailboxId:selected.id,alias:a.alias_address},'Alias restored.'))}
        </View>)}
        {field('New alias, e.g. help@kleenest.us',alias,setAlias)}
        {actionButton('Add alias',()=>{void run('add_alias',{mailboxId:selected.id,alias},'Alias added.');setAlias('')},!alias.trim())}
        <SectionHeader title="Assigned accounts" body="Each person signs in with their own Kleenest credentials. Membership never grants Owner app privileges."/>
        {selected.members.map(m=><View key={m.user_id} style={{padding:10,borderRadius:12,backgroundColor:theme.surfaceRaised,gap:6}}>
          <Text style={{color:theme.ink,fontWeight:'800'}}>{m.email||m.user_id}</Text>
          <Text style={{color:theme.muted,fontSize:12}}>{m.access_role} · {m.can_send?'Can send':'Read only'}</Text>
          {actionButton('Revoke mailbox access',()=>void run('remove_member',{mailboxId:selected.id,userId:m.user_id},'Mailbox access revoked.'),false,true)}
        </View>)}
        <Text style={{color:theme.muted,fontSize:12}}>Choose an account below to grant or update its mailbox permissions.</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{roles.map(role=><Pressable key={role} onPress={()=>{setMemberRole(role);setCanSend(role!=='viewer')}} style={{padding:9,borderRadius:10,backgroundColor:memberRole===role?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'800',color:memberRole===role?theme.accentText:theme.accent}}>{role}</Text></Pressable>)}</View>
        {memberRole!=='viewer'?toggle('Allow sending',canSend,setCanSend):null}
        <Text style={{color:theme.ink,fontSize:12}}>Selected: {targetUserLabel||'Choose an account below'}</Text>
        {actionButton('Grant / update mailbox access',()=>void run('assign_member',{mailboxId:selected.id,userId:targetUserId,role:memberRole,canSend:memberRole!=='viewer'&&canSend},'Mailbox permissions updated.'),!targetUserId)}
      </View>:null}
      <View style={{...card,gap:10}}>
        <SectionHeader title="Account lookup" body="Find an existing Kleenest member by name or account email, then assign the selected user to a mailbox."/>
        {field('Name or sign-in email',userSearch,setUserSearch)}
        {actionButton('Search accounts',()=>void findUsers(),!userSearch.trim())}
        {userRows.slice(0,20).map((u:any)=><Pressable key={String(u.id)} onPress={()=>pickUser(u)} style={{padding:10,borderRadius:11,backgroundColor:targetUserId===String(u.id)?theme.accentSoft:theme.surfaceRaised}}>
          <Text style={{color:theme.ink,fontWeight:'800'}}>{String(u.display_name||u.username||u.email||u.id)}</Text>
          <Text style={{color:theme.muted,fontSize:12}}>{String(u.email||u.id)}</Text>
        </Pressable>)}
        {targetUserId?<Text style={{color:theme.success,fontWeight:'800'}}>Selected: {targetUserLabel}</Text>:null}
      </View>
    </>}
  </ScrollView>
}