import { useEffect,useMemo,useState } from 'react';
import { router } from 'expo-router';
import { Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import {
  archiveOwnerMailThread,blockOwnerMailSender,forwardOwnerMailThread,getOwnerMailStatus,getOwnerMailThread,listOwnerMailThreads,
  markOwnerMailThreadSpam,replyOwnerMailThread,saveOwnerMailDraft,sendOwnerMail,setOwnerMailThreadInbox,setOwnerMailThreadLabel,setOwnerMailThreadRead,
  setOwnerMailThreadStarred,trashOwnerMailThread,listOwnerMailboxes,
  type OwnerMailConnectionStatus,type OwnerMailThread,type OwnerMailThreadSummary,type OwnerMailbox,
} from '../services/communications';

type ViewKey='action'|'inbox'|'waiting'|'sent'|'drafts'|'spam'|'trash'|'all';
type DateValue=string|number|Date|null|undefined;
const views:Record<ViewKey,{label:string;description:string;mailbox:'inbox'|'sent'|'drafts'|'spam'|'trash'|'all';direction:'any'|'incoming'|'outgoing'}>={
  action:{label:'Needs reply',description:'Inbound conversations waiting on Kleenest.',mailbox:'inbox',direction:'incoming'},
  inbox:{label:'Inbox',description:'Every current inbox conversation.',mailbox:'inbox',direction:'any'},
  waiting:{label:'Waiting',description:'Inbox conversations where Kleenest sent the latest reply.',mailbox:'inbox',direction:'outgoing'},
  sent:{label:'Sent',description:'New outbound conversations sent by Kleenest.',mailbox:'sent',direction:'any'},
  drafts:{label:'Drafts',description:'Saved messages that have not been sent.',mailbox:'drafts',direction:'any'},
  spam:{label:'Spam',description:'Blocked or manually filtered conversations.',mailbox:'spam',direction:'any'},
  trash:{label:'Trash',description:'Deleted conversations that can be restored.',mailbox:'trash',direction:'any'},
  all:{label:'All mail',description:'Every conversation except Trash.',mailbox:'all',direction:'any'},
};
const date=(v:DateValue)=>{
  const d=new Date(v||'');
  return Number.isFinite(d.getTime())?d.toLocaleString():'';
};

export default function Communications(){
  const theme=usePlatformTheme(); const card=useOSCardStyle();
  const[status,setStatus]=useState<OwnerMailConnectionStatus|null>(null);
  const[mailboxes,setMailboxes]=useState<OwnerMailbox[]>([]);
  const[selectedMailboxId,setSelectedMailboxId]=useState<string>('');
  const[threads,setThreads]=useState<OwnerMailThreadSummary[]>([]);
  const[selected,setSelected]=useState<OwnerMailThread|null>(null);
  const[view,setView]=useState<ViewKey>('action'); const[query,setQuery]=useState(''); const[unread,setUnread]=useState(false);
  const[busy,setBusy]=useState(false); const[notice,setNotice]=useState('');
  const[compose,setCompose]=useState(false); const[draftThreadId,setDraftThreadId]=useState<string|null>(null); const[to,setTo]=useState(''); const[cc,setCc]=useState(''); const[bcc,setBcc]=useState('');
  const[subject,setSubject]=useState(''); const[body,setBody]=useState(''); const[reply,setReply]=useState('');
  const[forward,setForward]=useState(false); const[forwardTo,setForwardTo]=useState(''); const[forwardBody,setForwardBody]=useState('');
  const[label,setLabel]=useState('');
  const unreadCount=useMemo(()=>threads.filter(t=>t.unread).length,[threads]);
  const ready=Boolean(status?.connected);

  async function load(nextView=view,mailboxId=selectedMailboxId){
    setBusy(true);
    try{
      const [s,r,m]=await Promise.all([
        getOwnerMailStatus(),
        listOwnerMailThreads({query,unreadOnly:unread,maxResults:75,mailbox:views[nextView].mailbox,mailboxId:mailboxId||null,direction:views[nextView].direction}),
        listOwnerMailboxes(),
      ]);
      setStatus(s); setThreads(r.threads); setMailboxes(m.mailboxes); setView(nextView); setNotice('');
    }catch(e:any){setNotice(String(e?.message||'Email Center could not be loaded.'))}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[]);

  async function open(t:OwnerMailThreadSummary){
    setBusy(true);
    try{
      const r=await getOwnerMailThread(t.id); setSelected(r.thread); setReply(''); setForward(false);
      if(r.thread.unread){await setOwnerMailThreadRead(t.id,true); setThreads(x=>x.map(v=>v.id===t.id?{...v,unread:false}:v))}
    }catch(e:any){setNotice(String(e?.message||'Thread could not be opened.'))}
    finally{setBusy(false)}
  }
  async function refreshSelected(){if(selected)setSelected((await getOwnerMailThread(selected.id)).thread)}
  function clearComposer(){setTo('');setCc('');setBcc('');setSubject('');setBody('');setDraftThreadId(null);setCompose(false)}
  async function saveDraft(){
    if(!to.trim()&&!cc.trim()&&!bcc.trim()&&!subject.trim()&&!body.trim())return;
    setBusy(true);
    try{const saved=await saveOwnerMailDraft({mailboxId:selectedMailboxId||null,draftId:draftThreadId,to,cc,bcc,subject,body});setDraftThreadId(saved.threadId);setCompose(false);setNotice('Draft saved.');await load('drafts')}
    catch(e:any){setNotice(String(e?.message||'Draft could not be saved.'))}finally{setBusy(false)}
  }
  async function openDraft(t:OwnerMailThreadSummary){
    setBusy(true);
    try{const r=await getOwnerMailThread(t.id);const m=r.thread.messages[r.thread.messages.length-1];setDraftThreadId(r.thread.id);setTo(m?.to||'');setCc(m?.cc||'');setBcc(m?.bcc||'');setSubject(r.thread.subject==='(draft)'?'':r.thread.subject);setBody(m?.body||'');setSelectedMailboxId(r.thread.mailboxId||selectedMailboxId);setCompose(true);setSelected(null);setNotice('Draft loaded into composer.')}
    catch(e:any){setNotice(String(e?.message||'Draft could not be opened.'))}finally{setBusy(false)}
  }
  async function sendNew(){
    if(!to.trim()||!subject.trim()||!body.trim())return;
    setBusy(true);
    try{await sendOwnerMail({mailboxId:selectedMailboxId||null,to,cc,bcc,subject,body});if(draftThreadId)await trashOwnerMailThread(draftThreadId);clearComposer();setNotice('Email sent from Kleenest.');await load('sent')}
    catch(e:any){setNotice(String(e?.message||'Email could not be sent.'))}finally{setBusy(false)}
  }
  async function sendReply(all=false){
    if(!selected||!reply.trim())return; setBusy(true);
    try{await replyOwnerMailThread({threadId:selected.id,body:reply,replyAll:all});setReply('');await refreshSelected();setNotice(all?'Reply all sent from Kleenest.':'Reply sent from Kleenest.');await load()}
    catch(e:any){setNotice(String(e?.message||'Reply could not be sent.'))}finally{setBusy(false)}
  }
  async function sendForward(){
    if(!selected||!forwardTo.trim())return; setBusy(true);
    try{await forwardOwnerMailThread({threadId:selected.id,to:forwardTo,body:forwardBody});setForward(false);setForwardTo('');setForwardBody('');setNotice('Message forwarded from Kleenest.');await refreshSelected()}
    catch(e:any){setNotice(String(e?.message||'Forward could not be sent.'))}finally{setBusy(false)}
  }
  async function mutate(fn:()=>Promise<any>,message:string,remove=false){
    if(!selected)return; setBusy(true);
    try{await fn();setNotice(message);if(remove){setThreads(x=>x.filter(t=>t.id!==selected.id));setSelected(null)}else{await refreshSelected();await load()}}
    catch(e:any){setNotice(String(e?.message||'Email action failed.'))}finally{setBusy(false)}
  }
  async function addLabel(){
    if(!selected||!label.trim())return;
    await mutate(()=>setOwnerMailThreadLabel(selected.id,label.trim(),true),'Label added.');setLabel('');
  }

  return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load()}/>} contentContainerStyle={{padding:16,gap:14,paddingBottom:80,backgroundColor:theme.canvas}}>
    <OSHero eyebrow="KLEENESTOS · COMMUNICATIONS" title="Kleenest Email Center" body="A first-party inbox for support, outreach, partnerships and operations. KleenestOS owns the threads; Resend handles delivery.">
      <StatusPill label={status?.emailAddress||'support@kleenest.us'} tone={ready?'good':'warning'}/>
      <StatusPill label={ready?'MAIL LIVE':'SETUP IN PROGRESS'} tone={ready?'good':'warning'}/>
      {unreadCount?<StatusPill label={`${unreadCount} UNREAD`} tone="warning"/>:null}
    </OSHero>

    {notice?<View style={{...card,borderColor:theme.warning}}><Text style={{fontWeight:'800',color:theme.warning}}>{notice}</Text></View>:null}

    <View style={{...card,gap:8}}>
      <SectionHeader title="Email service" body="No Gmail connection is required. KleenestOS is the system of record."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <StatusPill label={status?.providerConfigured?'RESEND CONNECTED':'PROVIDER PENDING'} tone={status?.providerConfigured?'good':'warning'}/>
        <StatusPill label={status?.domainStatus==='verified'?'DOMAIN VERIFIED':'DOMAIN DNS PENDING'} tone={status?.domainStatus==='verified'?'good':'warning'}/>
        <StatusPill label={status?.webhookEnabled?'INBOUND LIVE':'INBOUND PENDING'} tone={status?.webhookEnabled?'good':'warning'}/>
      </View>
      <Text style={{fontSize:12,color:theme.muted}}>Primary: support@kleenest.us · Fallback: {status?.fallbackAddress||'Kleenestapp@gmail.com'}</Text>
      <Pressable accessibilityRole="button" onPress={()=>router.push('/mail-admin')} style={{alignSelf:'flex-start',paddingHorizontal:11,paddingVertical:9,borderRadius:12,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Manage addresses, aliases & forwarding</Text></Pressable>
    </View>

    <View style={{...card,gap:10}}>
      <SectionHeader title="Mailbox" body="View one address or the combined Kleenest inbox. Compose uses the selected address."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <Pressable onPress={()=>{setSelectedMailboxId('');void load(view,'')}} style={{paddingHorizontal:11,paddingVertical:9,borderRadius:999,backgroundColor:selectedMailboxId?theme.accentSoft:theme.accent}}><Text style={{fontWeight:'900',color:selectedMailboxId?theme.accent:theme.accentText}}>All addresses</Text></Pressable>
        {mailboxes.filter(m=>m.active).map(m=><Pressable key={m.id} onPress={()=>{setSelectedMailboxId(m.id);void load(view,m.id)}} style={{paddingHorizontal:11,paddingVertical:9,borderRadius:999,backgroundColor:selectedMailboxId===m.id?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:selectedMailboxId===m.id?theme.accentText:theme.accent}}>{m.address}</Text></Pressable>)}
      </View>
    </View>

    <View style={{...card,gap:10}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <View style={{flex:1}}><Text style={{fontWeight:'900',color:theme.ink}}>Smart views</Text><Text style={{fontSize:12,color:theme.muted}}>{views[view].description}</Text></View>
        <Pressable disabled={busy} onPress={()=>setCompose(v=>!v)} style={{padding:11,borderRadius:12,backgroundColor:theme.accent,opacity:busy?0.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>{compose?'Close':'Compose'}</Text></Pressable>
      </View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {(Object.keys(views) as ViewKey[]).map(k=><Pressable key={k} onPress={()=>void load(k)} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:k===view?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:k===view?theme.accentText:theme.accent}}>{views[k].label}</Text></Pressable>)}
      </View>
    </View>

    {compose?<View style={{...card,gap:8,borderColor:theme.accent}}>
      <SectionHeader title={draftThreadId?'Edit draft':'New email'} body={ready?'Send from '+(mailboxes.find(m=>m.id===selectedMailboxId)?.address||'support@kleenest.us')+'.':'Delivery is temporarily unavailable, but drafts can still be saved.'}/>
      {[
        ['To',to,setTo],['Cc (optional)',cc,setCc],['Bcc (optional)',bcc,setBcc],['Subject',subject,setSubject],
      ].map(([p,v,s]:any)=><TextInput key={p} value={v} onChangeText={s} placeholder={p} placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>)}
      <TextInput value={body} onChangeText={setBody} placeholder="Write your message…" placeholderTextColor={theme.muted} multiline style={{minHeight:130,textAlignVertical:'top',borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}><Pressable disabled={busy||(!to.trim()&&!cc.trim()&&!bcc.trim()&&!subject.trim()&&!body.trim())} onPress={()=>void saveDraft()} style={{padding:12,borderRadius:12,alignItems:'center',backgroundColor:theme.accentSoft,opacity:busy||(!to.trim()&&!cc.trim()&&!bcc.trim()&&!subject.trim()&&!body.trim())?0.5:1}}><Text style={{fontWeight:'900',color:theme.accent}}>Save draft</Text></Pressable><Pressable disabled={!ready||busy||!to.trim()||!subject.trim()||!body.trim()} onPress={()=>void sendNew()} style={{padding:12,borderRadius:12,alignItems:'center',backgroundColor:theme.accent,opacity:!ready||busy||!to.trim()||!subject.trim()||!body.trim()?0.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>Send from Kleenest</Text></Pressable></View>
    </View>:null}

    <View style={{...card,gap:8}}>
      <SectionHeader title="Find conversations" body="Search the current Kleenest view."/>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search this Kleenest view" placeholderTextColor={theme.muted} onSubmitEditing={()=>void load()} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <View style={{flexDirection:'row',gap:8}}>
        <Pressable onPress={()=>{setUnread(v=>!v);setTimeout(()=>void load(),0)}} style={{padding:9,borderRadius:999,backgroundColor:unread?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:unread?theme.accentText:theme.accent}}>Unread</Text></Pressable>
        <Pressable onPress={()=>void load()} style={{padding:9,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Refresh</Text></Pressable>
      </View>
    </View>

    {threads.length===0?<View style={{...card}}><Text style={{fontWeight:'900',color:theme.ink}}>{busy?'Loading mail…':'No conversations in this view'}</Text><Text style={{fontSize:12,color:theme.muted,marginTop:5}}>New mail to support@kleenest.us will appear here automatically.</Text></View>:threads.map(t=><Pressable key={t.id} onPress={()=>t.folder==='drafts'?void openDraft(t):void open(t)} style={{...card,gap:5,borderColor:t.unread?theme.warning:theme.line}}>
      <View style={{flexDirection:'row',gap:8}}><Text numberOfLines={1} style={{flex:1,fontWeight:t.unread?'900':'800',color:theme.ink}}>{t.subject}</Text>{t.starred?<Text style={{color:theme.warning}}>★</Text>:null}</View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{t.mailboxAddress?<StatusPill label={t.mailboxAddress} tone="neutral"/>:null}{t.sourceApp?<StatusPill label={`${t.sourceApp.toUpperCase()} SUPPORT`} tone="good"/>:<StatusPill label="EMAIL"/>}{t.folder==='drafts'?<StatusPill label="DRAFT" tone="warning"/>:null}{t.folder==='spam'?<StatusPill label="SPAM" tone="danger"/>:null}</View><Text numberOfLines={1} style={{fontSize:12,fontWeight:'800',color:theme.accent}}>{t.from||t.fromEmail||'Conversation'}</Text>
      <Text numberOfLines={2} style={{fontSize:12,lineHeight:18,color:theme.muted}}>{t.snippet}</Text>
      <Text style={{fontSize:11,color:theme.muted}}>{String(t.folder||views[view].mailbox).toUpperCase()} · {t.latestSent?'KLEENEST LAST':'INBOUND LAST'} · {date(t.date)} · {t.messageCount} message{t.messageCount===1?'':'s'}</Text>
    </Pressable>)}

    {selected?<View style={{...card,gap:12,borderColor:theme.accent}}>
      <Text style={{fontSize:18,fontWeight:'900',color:theme.ink}}>{selected.subject}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{selected.mailboxAddress?<StatusPill label={selected.mailboxAddress} tone="neutral"/>:null}{selected.sourceApp?<StatusPill label={`${selected.sourceApp.toUpperCase()} SUPPORT`} tone="good"/>:null}{selected.supportRequestId?<StatusPill label="APP SUPPORT" tone="good"/>:null}{selected.folder==='spam'?<StatusPill label="SPAM" tone="danger"/>:null}</View><Text style={{fontSize:12,color:theme.muted}}>{selected.participants.join(' · ')}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
        <Pressable onPress={()=>void mutate(()=>setOwnerMailThreadStarred(selected.id,!selected.starred),selected.starred?'Star removed.':'Conversation starred.')} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>{selected.starred?'Unstar':'Star'}</Text></Pressable>
        <Pressable onPress={()=>void mutate(()=>setOwnerMailThreadRead(selected.id,selected.unread),selected.unread?'Marked read.':'Marked unread.')} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>{selected.unread?'Mark read':'Mark unread'}</Text></Pressable>
        {selected.folder!=='inbox'?<Pressable onPress={()=>void mutate(()=>setOwnerMailThreadInbox(selected.id,true),'Moved to inbox.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Move to inbox</Text></Pressable>:null}
        {selected.folder==='inbox'?<Pressable onPress={()=>void mutate(()=>archiveOwnerMailThread(selected.id),'Conversation archived.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Archive</Text></Pressable>:null}
        {!selected.supportRequestId&&selected.messages.some(m=>!m.sent)&&!['spam','trash','drafts'].includes(String(selected.folder||''))?<Pressable onPress={()=>void mutate(()=>markOwnerMailThreadSpam(selected.id),'Conversation moved to Spam.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.warning}}>Spam</Text></Pressable>:null}
        {!selected.supportRequestId&&selected.messages.some(m=>!m.sent)?<Pressable onPress={()=>void mutate(()=>blockOwnerMailSender(selected.id),'Sender blocked and conversation moved to Spam.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.danger}}>Block sender</Text></Pressable>:null}
        {selected.folder!=='trash'?<Pressable onPress={()=>void mutate(()=>trashOwnerMailThread(selected.id),'Conversation moved to Trash.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Trash</Text></Pressable>:null}
      </View>

      {selected.messages.map(m=><View key={m.id} style={{borderTopWidth:1,borderColor:theme.line,paddingTop:10,gap:6}}>
        <Text style={{fontWeight:'900',color:theme.ink}}>{m.sent?'Kleenest':m.from}</Text>
        <View style={{flexDirection:'row',gap:7,alignItems:'center',flexWrap:'wrap'}}><Text style={{fontSize:11,color:theme.muted}}>{date(m.date)} · {m.sent?'Outbound':'Inbound'}</Text>{m.deliveryStatus?<StatusPill label={String(m.deliveryStatus).replaceAll('_',' ').toUpperCase()} tone={m.deliveryStatus==='draft'?'warning':String(m.deliveryStatus).includes('failed')?'danger':'neutral'}/>:null}</View>
        <Text selectable style={{fontSize:14,lineHeight:21,color:theme.ink}}>{m.body||m.snippet||'(no body)'}</Text>
        {m.attachments.length?<View><Text style={{fontWeight:'900',fontSize:12,color:theme.ink}}>Attachments</Text>{m.attachments.map((a,i)=><Text key={i} style={{fontSize:12,color:theme.muted}}>{a.filename} · {a.mimeType}</Text>)}</View>:null}
      </View>)}

      <Text style={{fontWeight:'900',color:theme.ink}}>Reply</Text>
      <TextInput value={reply} onChangeText={setReply} placeholder="Write a reply…" placeholderTextColor={theme.muted} multiline style={{minHeight:100,textAlignVertical:'top',borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
        <Pressable disabled={!ready||busy||!reply.trim()} onPress={()=>void sendReply(false)} style={{padding:10,borderRadius:12,backgroundColor:theme.accent,opacity:!ready||busy||!reply.trim()?0.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>Reply</Text></Pressable>
        <Pressable disabled={!ready||busy||!reply.trim()} onPress={()=>void sendReply(true)} style={{padding:10,borderRadius:12,backgroundColor:theme.accentSoft,opacity:!ready||busy||!reply.trim()?0.5:1}}><Text style={{fontWeight:'900',color:theme.accent}}>Reply all</Text></Pressable>
        <Pressable disabled={!ready||busy} onPress={()=>setForward(v=>!v)} style={{padding:10,borderRadius:12,backgroundColor:theme.accentSoft,opacity:!ready||busy?0.5:1}}><Text style={{fontWeight:'900',color:theme.accent}}>Forward</Text></Pressable>
      </View>
      {forward?<View style={{gap:8}}>
        <TextInput value={forwardTo} onChangeText={setForwardTo} placeholder="Forward to" placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
        <TextInput value={forwardBody} onChangeText={setForwardBody} placeholder="Optional note" placeholderTextColor={theme.muted} multiline style={{minHeight:80,textAlignVertical:'top',borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
        <Pressable onPress={()=>void sendForward()} style={{padding:10,borderRadius:12,backgroundColor:theme.accent}}><Text style={{fontWeight:'900',color:theme.accentText}}>Forward message</Text></Pressable>
      </View>:null}

      <Text style={{fontWeight:'900',color:theme.ink}}>Kleenest labels</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{selected.labelNames.map(v=><Pressable key={v} onPress={()=>void mutate(()=>setOwnerMailThreadLabel(selected.id,v,false),'Label removed.')} style={{padding:7,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>{v} ×</Text></Pressable>)}</View>
      <View style={{flexDirection:'row',gap:8}}><TextInput value={label} onChangeText={setLabel} placeholder="Add label" placeholderTextColor={theme.muted} style={{flex:1,borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/><Pressable onPress={()=>void addLabel()} style={{padding:11,borderRadius:12,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Add</Text></Pressable></View>
    </View>:null}
  </ScrollView>;
}
