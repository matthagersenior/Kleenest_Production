import { createElement,useEffect,useMemo,useRef,useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter,usePathname } from 'expo-router';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { getOwnerAuthorization } from '../services/ownerAdmin';
import { Linking,Platform,Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import {
  archiveOwnerMailThread,blockOwnerMailThreadSender,forwardOwnerMailThread,getOwnerMailAttachment,getOwnerMailStatus,getOwnerMailThread,listOwnerMailboxes,listOwnerMailThreads,
  replyOwnerMailThread,saveOwnerMailDraft,sendOwnerMail,setOwnerMailThreadInbox,setOwnerMailThreadLabel,setOwnerMailThreadRead,
  setOwnerMailThreadStarred,spamOwnerMailThread,trashOwnerMailThread,
  type MailUploadAttachment,type OwnerMailbox,type OwnerMailConnectionStatus,type OwnerMailThread,type OwnerMailThreadSummary,
} from '../services/communications';

type ViewKey='action'|'inbox'|'waiting'|'sent'|'drafts'|'spam'|'trash'|'all';
type DateValue=string|number|Date|null|undefined;
const views:Record<ViewKey,{label:string;description:string;mailbox:'inbox'|'sent'|'drafts'|'spam'|'trash'|'all';direction:'any'|'incoming'|'outgoing'}>={
  action:{label:'Needs reply',description:'Inbound conversations waiting on Kleenest.',mailbox:'inbox',direction:'incoming'},
  inbox:{label:'Inbox',description:'Every current inbox conversation.',mailbox:'inbox',direction:'any'},
  waiting:{label:'Waiting',description:'Inbox conversations where Kleenest sent the latest reply.',mailbox:'inbox',direction:'outgoing'},
  sent:{label:'Sent',description:'New outbound conversations sent by Kleenest.',mailbox:'sent',direction:'any'},
  drafts:{label:'Drafts',description:'Saved messages that have not been sent.',mailbox:'drafts',direction:'any'},
  spam:{label:'Spam',description:'Messages moved to spam.',mailbox:'spam',direction:'any'},
  trash:{label:'Trash',description:'Deleted conversations that can be restored.',mailbox:'trash',direction:'any'},
  all:{label:'All mail',description:'Every conversation except Trash.',mailbox:'all',direction:'any'},
};
const date=(v:DateValue)=>{
  const d=new Date(v||'');
  return Number.isFinite(d.getTime())?d.toLocaleString():'';
};

export default function Communications(){
  const theme=usePlatformTheme(); const card=useOSCardStyle();
  const router=useRouter(),pathname=usePathname();
  const scrollRef=useRef<ScrollView>(null);
  const[serviceDetails,setServiceDetails]=useState(false);
  const[attachments,setAttachments]=useState<MailUploadAttachment[]>([]);
  const[canManage,setCanManage]=useState(false);
  const[status,setStatus]=useState<OwnerMailConnectionStatus|null>(null);
  const[mailboxes,setMailboxes]=useState<OwnerMailbox[]>([]);
  const[mailboxId,setMailboxId]=useState('');
  const[composeMailboxId,setComposeMailboxId]=useState('');
  const[threads,setThreads]=useState<OwnerMailThreadSummary[]>([]);
  const[selected,setSelected]=useState<OwnerMailThread|null>(null);
  const[view,setView]=useState<ViewKey>('action'); const[query,setQuery]=useState(''); const[unread,setUnread]=useState(false);
  const[busy,setBusy]=useState(false); const[notice,setNotice]=useState('');
  const[compose,setCompose]=useState(false); const[draftId,setDraftId]=useState<string|null>(null); const[to,setTo]=useState(''); const[cc,setCc]=useState(''); const[bcc,setBcc]=useState('');
  const[subject,setSubject]=useState(''); const[body,setBody]=useState(''); const[reply,setReply]=useState('');
  const[forward,setForward]=useState(false); const[forwardTo,setForwardTo]=useState(''); const[forwardBody,setForwardBody]=useState('');
  const[label,setLabel]=useState('');
  const unreadCount=useMemo(()=>threads.filter(t=>t.unread).length,[threads]);
  const activeMailbox=useMemo(()=>mailboxes.find(m=>m.id===mailboxId)||null,[mailboxes,mailboxId]);
  const composeMailbox=useMemo(()=>mailboxes.find(m=>m.id===composeMailboxId)||null,[mailboxes,composeMailboxId]);
  const selectedCanModify=Boolean(mailboxes.find(m=>m.id===selected?.mailboxId)?.can_modify);
  const selectedCanManage=Boolean(mailboxes.find(m=>m.id===selected?.mailboxId)?.can_manage);
  const selectedCanSend=Boolean(mailboxes.find(m=>m.id===selected?.mailboxId)?.send_enabled);
  const ready=Boolean(status?.connected);

  async function load(nextView=view,nextMailboxId=mailboxId,nextUnread=unread){
    setBusy(true);
    try{
      const [s,d,r]=await Promise.all([
        getOwnerMailStatus(),
        listOwnerMailboxes(),
        listOwnerMailThreads({query,unreadOnly:nextUnread,maxResults:75,mailbox:views[nextView].mailbox,direction:views[nextView].direction,mailboxId:nextMailboxId||undefined}),
      ]);
      const available=(d.mailboxes||[]).filter(m=>m.active&&m.mailbox_type!=='system');
      setStatus(s); setMailboxes(available); setThreads(r.threads); setView(nextView);
    }catch(e:any){setNotice(String(e?.message||'Email Center could not be loaded.'))}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load();getOwnerAuthorization().then(a=>setCanManage(a.is_platform_owner)).catch(()=>setCanManage(false))},[]);

  async function open(t:OwnerMailThreadSummary){
    setBusy(true);
    try{
      const r=await getOwnerMailThread(t.id); setSelected(r.thread); setReply(''); setForward(false); scrollRef.current?.scrollTo({y:0,animated:true});
      if(r.thread.unread&&mailboxes.find(m=>m.id===r.thread.mailboxId)?.can_modify){await setOwnerMailThreadRead(t.id,true); setThreads(x=>x.map(v=>v.id===t.id?{...v,unread:false}:v))}
    }catch(e:any){setNotice(String(e?.message||'Thread could not be opened.'))}
    finally{setBusy(false)}
  }
  async function refreshSelected(){if(selected)setSelected((await getOwnerMailThread(selected.id)).thread)}
  function clearCompose(){
    setDraftId(null);setTo('');setCc('');setBcc('');setSubject('');setBody('');setComposeMailboxId('');setAttachments([]);setCompose(false);
  }
  function startCompose(){
    const preferred=mailboxId||mailboxes.find(m=>m.mailbox_type==='personal'&&m.send_enabled)?.id||mailboxes.find(m=>m.address==='support@kleenest.us')?.id||mailboxes.find(m=>m.send_enabled)?.id||'';
    setDraftId(null);setTo('');setCc('');setBcc('');setSubject('');setBody('');setAttachments([]);setComposeMailboxId(preferred);setSelected(null);setCompose(true);
  }
  async function sendNew(){
    if(!to.trim()||!subject.trim()||!body.trim())return;
    setBusy(true);
    try{
      await sendOwnerMail({mailboxId:composeMailboxId||undefined,to,cc,bcc,subject,body,attachments});
      if(draftId)await trashOwnerMailThread(draftId);
      clearCompose();setNotice('Email sent from Kleenest.');await load('sent');
    }catch(e:any){setNotice(String(e?.message||'Email could not be sent.'))}finally{setBusy(false)}
  }
  async function saveDraft(){
    if(attachments.length){setNotice('Remove attachments before saving a draft; attachments can be added when sending.');return;}
    if(!to.trim()&&!cc.trim()&&!bcc.trim()&&!subject.trim()&&!body.trim())return;
    setBusy(true);
    try{
      const saved=await saveOwnerMailDraft({draftId,mailboxId:composeMailboxId||undefined,to,cc,bcc,subject,body});
      setDraftId(saved.threadId);setCompose(false);setNotice('Draft saved.');await load('drafts');
    }catch(e:any){setNotice(String(e?.message||'Draft could not be saved.'))}finally{setBusy(false)}
  }
  function editDraft(){
    if(!selected||selected.folder!=='drafts')return;
    const message=selected.messages[selected.messages.length-1];
    const preferred=selected.mailboxId||mailboxId||mailboxes.find(m=>m.mailbox_type==='personal'&&m.send_enabled)?.id||mailboxes.find(m=>m.address==='support@kleenest.us')?.id||mailboxes.find(m=>m.send_enabled)?.id||'';
    setDraftId(selected.id);setTo(message?.to||'');setCc(message?.cc||'');setBcc(message?.bcc||'');setSubject(selected.subject||'');setBody(message?.body||'');setComposeMailboxId(preferred);
    setSelected(null);setAttachments([]);setCompose(true);setNotice('Editing saved draft.');
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
    if(!selected||!selectedCanModify||!label.trim())return;
    await mutate(()=>setOwnerMailThreadLabel(selected.id,label.trim(),true),'Label added.');setLabel('');
  }
  const allowedTypes:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',txt:'text/plain',csv:'text/csv'};
  function addFile(file:MailUploadAttachment,list:MailUploadAttachment[]){
    if(!allowedTypes[file.filename.split('.').pop()?.toLowerCase()||''])throw new Error('Supported attachments: PDF, PNG, JPG, TXT, CSV.');
    if(file.size>2*1024*1024)throw new Error('Each attachment must be 2 MB or smaller.');
    if(list.length>=3||list.reduce((sum,x)=>sum+x.size,0)+file.size>3*1024*1024)throw new Error('Limit: 3 files and 3 MB total.');
    list.push(file);
  }
  async function attachWebFiles(event:any){
    try{
      const picked=Array.from(event?.target?.files||[]) as File[];
      const next=[...attachments];
      for(const file of picked){
        if(file.size>2*1024*1024)throw new Error('Each attachment must be 2 MB or smaller.');
        const data=await new Promise<string>((resolve,reject)=>{
          const reader=new FileReader();reader.onerror=()=>reject(new Error('File could not be read.'));
          reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
          reader.readAsDataURL(file);
        });
        addFile({filename:file.name,content:data,contentType:allowedTypes[file.name.split('.').pop()?.toLowerCase()||'']||file.type,size:file.size},next);
      }
      setAttachments(next);setNotice('');
    }catch(error:any){setNotice(String(error?.message||'File could not be attached.'))}
    if(event?.target)event.target.value='';
  }
  async function attachNativePhotos(){
    try{
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],base64:true,allowsMultipleSelection:true});
      if(result.canceled)return;
      const next=[...attachments];
      for(const asset of result.assets){
        if(!asset.base64)throw new Error('Unable to read selected photo.');
        const size=asset.fileSize||Math.floor(asset.base64.length*3/4);
        const filename=asset.fileName||'photo.jpg';
        addFile({filename,content:asset.base64,contentType:allowedTypes[filename.split('.').pop()?.toLowerCase()||'']||asset.mimeType||'image/jpeg',size},next);
      }
      setAttachments(next);setNotice('');
    }catch(error:any){setNotice(String(error?.message||'Photos could not be attached.'))}
  }
  async function downloadAttachment(threadId:string,messageId:string,attachmentId:string){
    setBusy(true);
    try{
      const file=await getOwnerMailAttachment({threadId,messageId,attachmentId});
      if(!file.downloadUrl.startsWith('https://'))throw new Error('Secure download is unavailable.');
      await Linking.openURL(file.downloadUrl);
    }catch(error:any){setNotice(String(error?.message||'Attachment could not be downloaded.'))}
    finally{setBusy(false)}
  }

  return <ScrollView ref={scrollRef} refreshControl={<RefreshControl refreshing={busy} onRefresh={()=>void load()}/>} contentContainerStyle={{padding:16,gap:14,paddingBottom:80,backgroundColor:theme.canvas}}>
    <OSHero eyebrow={pathname==='/mail'?'KLEENEST MAIL':'KLEENESTOS · COMMUNICATIONS'} title={pathname==='/mail'?'Kleenest Mail':'Kleenest Email Center'} body="Read, reply, and send from the personal and shared @kleenest.us mailboxes assigned to you.">
      <StatusPill label={activeMailbox?.address||'ALL MAILBOXES'} tone={ready?'good':'warning'}/>
      <StatusPill label={ready?'MAIL CONFIGURED':'SETUP IN PROGRESS'} tone={ready?'good':'warning'}/>
      {(status?.unread_total??unreadCount)>0?<StatusPill label={`${status?.unread_total??unreadCount} UNREAD`} tone="warning"/>:null}
    </OSHero>

    {notice?<View style={{...card,borderColor:theme.warning}}><Text style={{fontWeight:'800',color:theme.warning}}>{notice}</Text></View>:null}

    <Pressable accessibilityRole="button" onPress={()=>setServiceDetails(v=>!v)} style={{alignSelf:'flex-start',paddingVertical:8,paddingHorizontal:10,backgroundColor:theme.accentSoft,borderRadius:10}}><Text style={{fontWeight:'800',color:theme.accent}}>{serviceDetails?'Hide connection details':'Connection details'}</Text></Pressable>
    {serviceDetails?<View style={{...card,gap:8}}>
      <SectionHeader title="Email service" body="No Gmail connection is required. Resend handles transport while KleenestOS and the installable Kleenest Mail client use the same authenticated mailbox backend."/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <StatusPill label={status?.providerConfigured?'RESEND CONFIGURED':'PROVIDER PENDING'} tone={status?.providerConfigured?'good':'warning'}/>
        <StatusPill label={status?.domainStatus==='verified'?'DOMAIN VERIFIED':'DOMAIN DNS PENDING'} tone={status?.domainStatus==='verified'?'good':'warning'}/>
        <StatusPill label={status?.webhookEnabled?'INBOUND CONFIGURED':'INBOUND PENDING'} tone={status?.webhookEnabled?'good':'warning'}/>
      </View>
      <Text style={{fontSize:12,color:theme.muted}}>Personal mailboxes are private by default; shared role addresses are available only to authorized Kleenest administrators and members.</Text>
    </View>:null}

    <View style={{...card,gap:10}}>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
        {canManage?<Pressable onPress={()=>router.push('/mail-admin')} style={{backgroundColor:theme.accent,padding:11,borderRadius:11}}><Text style={{color:theme.accentText,fontWeight:'900'}}>Manage mailboxes & access</Text></Pressable>:null}
        <Pressable onPress={()=>void getKleenestSupabaseClient().auth.signOut({scope:'local'}).then(()=>router.replace({pathname:'/auth',params:{returnTo:pathname==='/mail'?'/mail':'/'}})).catch(e=>setNotice(String(e?.message||e)))} style={{backgroundColor:theme.accentSoft,padding:11,borderRadius:11}}><Text style={{color:theme.accent,fontWeight:'900'}}>Sign out</Text></Pressable>
      </View>
      <SectionHeader title="Mailboxes" body="Select a mailbox. Sending and editing follow the permissions granted to your account."/>
      {activeMailbox?<Text style={{fontSize:12,color:theme.muted}}>Access: {activeMailbox.can_modify?'Manage conversations':activeMailbox.send_enabled?'Send and read':'Read only'}{activeMailbox.forwarding_enabled?' · Forwarding on':''}{activeMailbox.auto_reply_enabled?' · Auto-reply on':''}</Text>:null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:3}}>
        <Pressable onPress={()=>{setMailboxId('');setSelected(null);void load(view,'')}} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:mailboxId===''?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:mailboxId===''?theme.accentText:theme.accent}}>All</Text></Pressable>
        {mailboxes.map(m=><Pressable key={m.id} onPress={()=>{setMailboxId(m.id);setSelected(null);void load(view,m.id)}} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:m.id===mailboxId?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:m.id===mailboxId?theme.accentText:theme.accent}}>{m.address}</Text></Pressable>)}
      </ScrollView>
    </View>

    <View style={{...card,gap:10}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <View style={{flex:1}}><Text style={{fontWeight:'900',color:theme.ink}}>Smart views</Text><Text style={{fontSize:12,color:theme.muted}}>{views[view].description}</Text></View>
        <Pressable disabled={busy} onPress={()=>compose?clearCompose():startCompose()} style={{padding:11,borderRadius:12,backgroundColor:theme.accent,opacity:busy?0.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>{compose?'Close':'Compose'}</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingVertical:3}}>
        {(Object.keys(views) as ViewKey[]).map(k=><Pressable key={k} onPress={()=>{setSelected(null);setCompose(false);void load(k)}} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:k===view?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:k===view?theme.accentText:theme.accent}} >{views[k].label}</Text></Pressable>)}
      </ScrollView>
    </View>

    {compose?<View style={{...card,gap:8,borderColor:theme.accent}}>
      <SectionHeader title={draftId?'Edit draft':'New email'} body={ready?`Send from ${composeMailbox?.display_name||'Kleenest'} <${composeMailbox?.address||'select a mailbox'}>.`:'Delivery is temporarily unavailable, but drafts can still be saved.'}/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {mailboxes.filter(m=>m.send_enabled).map(m=><Pressable key={m.id} onPress={()=>setComposeMailboxId(m.id)} style={{paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:m.id===composeMailboxId?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:m.id===composeMailboxId?theme.accentText:theme.accent}}>{m.address}</Text></Pressable>)}
      </View>
      {[
        ['To',to,setTo],['Cc (optional)',cc,setCc],['Bcc (optional)',bcc,setBcc],['Subject',subject,setSubject],
      ].map(([p,v,s]:any)=><TextInput key={p} value={v} onChangeText={s} placeholder={p} placeholderTextColor={theme.muted} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>)}
      <TextInput value={body} onChangeText={setBody} placeholder="Write your message…" placeholderTextColor={theme.muted} multiline style={{minHeight:130,textAlignVertical:'top',borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      {composeMailbox?.signature_text?<View style={{padding:10,borderRadius:10,backgroundColor:theme.surfaceRaised}}><Text style={{fontWeight:'800',fontSize:12,color:theme.ink}}>Signature added automatically when sent</Text><Text style={{color:theme.muted,fontSize:12}}>{composeMailbox.signature_text}</Text></View>:null}
      <View style={{gap:7}}>
        <Text style={{fontWeight:'800',color:theme.ink}}>Attachments ({attachments.length}/3)</Text>
        {Platform.OS==='web'?createElement('input' as any,{type:'file',multiple:true,accept:'.pdf,.png,.jpg,.jpeg,.txt,.csv','aria-label':'Attach files',onChange:(e:any)=>void attachWebFiles(e),style:{maxWidth:'100%',color:theme.ink}}):<Pressable accessibilityRole="button" onPress={()=>void attachNativePhotos()} style={{padding:10,backgroundColor:theme.accentSoft,borderRadius:10}}><Text style={{color:theme.accent,fontWeight:'800'}}>Attach photos</Text></Pressable>}
        {attachments.map((a,i)=><View key={i} style={{flexDirection:'row',alignItems:'center',gap:10}}><Text numberOfLines={1} style={{color:theme.ink,flex:1}}>{a.filename} ({Math.ceil(a.size/1024)} KB)</Text><Pressable accessibilityRole="button" onPress={()=>setAttachments(rows=>rows.filter((_,j)=>i!==j))}><Text style={{color:theme.danger,fontWeight:'800'}}>Remove</Text></Pressable></View>)}
        <Text style={{fontSize:11,color:theme.muted}}>Up to 3 files, 2 MB each, 3 MB combined. Save drafts without attachments; attach files when sending.</Text>
      </View>
      <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
        <Pressable disabled={attachments.length>0||busy||(!to.trim()&&!cc.trim()&&!bcc.trim()&&!subject.trim()&&!body.trim())} onPress={()=>void saveDraft()} style={{padding:12,borderRadius:12,alignItems:'center',backgroundColor:theme.accentSoft,opacity:attachments.length>0||busy||(!to.trim()&&!cc.trim()&&!bcc.trim()&&!subject.trim()&&!body.trim())?0.5:1}}><Text style={{fontWeight:'900',color:theme.accent}}>Save draft</Text></Pressable>
        <Pressable disabled={!ready||busy||!composeMailboxId||!to.trim()||!subject.trim()||!body.trim()} onPress={()=>void sendNew()} style={{padding:12,borderRadius:12,alignItems:'center',backgroundColor:theme.accent,opacity:!ready||busy||!composeMailboxId||!to.trim()||!subject.trim()||!body.trim()?0.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>Send from {composeMailbox?.address||'Kleenest'}</Text></Pressable>
      </View>
    </View>:null}

    {!selected&&!compose?<><View style={{...card,gap:8}}>
      <SectionHeader title="Find conversations" body="Search the current Kleenest view."/>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search this Kleenest view" placeholderTextColor={theme.muted} onSubmitEditing={()=>void load()} style={{borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
      <View style={{flexDirection:'row',gap:8}}>
        <Pressable onPress={()=>{const next=!unread;setUnread(next);void load(view,mailboxId,next)}} style={{padding:9,borderRadius:999,backgroundColor:unread?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:unread?theme.accentText:theme.accent}}>Unread</Text></Pressable>
        <Pressable onPress={()=>void load()} style={{padding:9,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Refresh</Text></Pressable>
      </View>
    </View>

    {threads.length===0?<View style={{...card}}><Text style={{fontWeight:'900',color:theme.ink}}>{busy?'Loading mail…':'No conversations in this view'}</Text><Text style={{fontSize:12,color:theme.muted,marginTop:5}}>New mail to {activeMailbox?.address||'any available Kleenest address'} will appear here automatically.</Text></View>:threads.map(t=><Pressable key={t.id} onPress={()=>void open(t)} style={{...card,gap:5,borderColor:t.unread?theme.warning:theme.line}}>
      <View style={{flexDirection:'row',gap:8}}><Text numberOfLines={1} style={{flex:1,fontWeight:t.unread?'900':'800',color:theme.ink}}>{t.subject}</Text>{t.starred?<Text style={{color:theme.warning}}>★</Text>:null}</View>
      <Text numberOfLines={1} style={{fontSize:12,fontWeight:'800',color:theme.accent}}>{t.from||t.fromEmail||'Conversation'}</Text>
      <Text numberOfLines={1} style={{fontSize:11,fontWeight:'800',color:theme.muted}}>{t.mailboxAddress||'Shared mailbox'}</Text>
      <Text numberOfLines={2} style={{fontSize:12,lineHeight:18,color:theme.muted}}>{t.snippet}</Text>
      <Text style={{fontSize:11,color:theme.muted}}>{String(t.folder||views[view].mailbox).toUpperCase()} · {t.latestSent?'KLEENEST LAST':'INBOUND LAST'} · {date(t.date)} · {t.messageCount} message{t.messageCount===1?'':'s'}</Text>
    </Pressable>)}</> :null}

    {selected?<View style={{...card,gap:12,borderColor:theme.accent}}>
      <Pressable accessibilityRole="button" onPress={()=>setSelected(null)} style={{alignSelf:'flex-start',padding:8,backgroundColor:theme.accentSoft,borderRadius:9}}><Text style={{color:theme.accent,fontWeight:'900'}}>← Back to conversations</Text></Pressable>
      {!selectedCanModify?<Text style={{color:theme.muted,fontSize:12}}>Read-only access: reply and organization controls are restricted for this mailbox.</Text>:null}
      <Text style={{fontSize:18,fontWeight:'900',color:theme.ink}}>{selected.subject}</Text>
      <StatusPill label={selected.mailboxAddress||'MAILBOX'} tone="good"/>
      <Text style={{fontSize:12,color:theme.muted}}>{selected.participants.join(' · ')}</Text>
      {selectedCanModify?<View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>
        {selectedCanSend&&selected.folder==='drafts'?<Pressable onPress={editDraft} style={{padding:8,borderRadius:999,backgroundColor:theme.accent}}><Text style={{fontWeight:'900',color:theme.accentText}}>Edit draft</Text></Pressable>:null}
        <Pressable onPress={()=>void mutate(()=>setOwnerMailThreadStarred(selected.id,!selected.starred),selected.starred?'Star removed.':'Conversation starred.')} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>{selected.starred?'Unstar':'Star'}</Text></Pressable>
        <Pressable onPress={()=>void mutate(()=>setOwnerMailThreadRead(selected.id,selected.unread),selected.unread?'Marked read.':'Marked unread.')} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>{selected.unread?'Mark read':'Mark unread'}</Text></Pressable>
        <Pressable onPress={()=>void mutate(()=>setOwnerMailThreadInbox(selected.id,true),'Moved to inbox.',selected.folder!=='inbox')} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Move to inbox</Text></Pressable>
        {selected.folder==='inbox'?<Pressable onPress={()=>void mutate(()=>archiveOwnerMailThread(selected.id),'Conversation archived.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Archive</Text></Pressable>:null}
        {!['drafts','spam','trash'].includes(String(selected.folder||''))&&selected.messages.some(m=>!m.sent)?<Pressable onPress={()=>void mutate(()=>spamOwnerMailThread(selected.id),'Conversation moved to Spam.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Spam</Text></Pressable>:null}
        {selectedCanManage&&selected.messages.some(m=>!m.sent)?<Pressable onPress={()=>void mutate(()=>blockOwnerMailThreadSender(selected.id),'Sender blocked and conversation moved to Spam.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Block sender</Text></Pressable>:null}
        {selected.folder!=='trash'?<Pressable onPress={()=>void mutate(()=>trashOwnerMailThread(selected.id),'Conversation moved to Trash.',true)} style={{padding:8,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Trash</Text></Pressable>:null}
      </View>:null}

      {selected.messages.map(m=><View key={m.id} style={{borderTopWidth:1,borderColor:theme.line,paddingTop:10,gap:6}}>
        <Text style={{fontWeight:'900',color:theme.ink}}>{m.sent?'Kleenest':m.from}</Text>
        <Text style={{fontSize:11,color:theme.muted}}>{date(m.date)} · {m.sent?'Outbound':'Inbound'}</Text>
        <Text selectable style={{fontSize:14,lineHeight:21,color:theme.ink}}>{m.body||m.snippet||'(no body)'}</Text>
        {m.attachments.length?<View><Text style={{fontWeight:'900',fontSize:12,color:theme.ink}}>Attachments</Text>{m.attachments.map((a,i)=>a.id?<Pressable key={i} accessibilityRole="button" disabled={busy} onPress={()=>void downloadAttachment(selected.id,m.id,String(a.id))} style={{paddingVertical:6}}><Text style={{fontSize:13,fontWeight:'800',color:theme.accent}}>↓ {a.filename} · Download</Text></Pressable>:<Text key={i} style={{fontSize:12,color:theme.muted}}>{a.filename} · Download not available</Text>)}</View>:null}
      </View>)}

      {selected.folder!=='drafts'&&selectedCanSend?<>
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
      </>:null}

      {selectedCanModify?<><Text style={{fontWeight:'900',color:theme.ink}}>Kleenest labels</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{selected.labelNames.map(v=><Pressable key={v} onPress={()=>void mutate(()=>setOwnerMailThreadLabel(selected.id,v,false),'Label removed.')} style={{padding:7,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>{v} ×</Text></Pressable>)}</View>
      <View style={{flexDirection:'row',gap:8}}><TextInput value={label} onChangeText={setLabel} placeholder="Add label" placeholderTextColor={theme.muted} style={{flex:1,borderWidth:1,borderColor:theme.line,borderRadius:12,padding:11,color:theme.ink,backgroundColor:theme.surfaceRaised}}/><Pressable onPress={()=>void addLabel()} style={{padding:11,borderRadius:12,backgroundColor:theme.accentSoft}} ><Text style={{fontWeight:'900',color:theme.accent}}>Add</Text></Pressable></View></>:null}
    </View>:null}
  </ScrollView>;
}
