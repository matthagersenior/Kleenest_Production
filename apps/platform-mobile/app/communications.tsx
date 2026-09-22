import { useEffect,useMemo,useRef,useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform,Pressable,RefreshControl,ScrollView,Text,TextInput,View } from 'react-native';
import { useLocalSearchParams,useRouter } from 'expo-router';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { OSHero,SectionHeader,StatusPill,useOSCardStyle } from '../components/KleenestOS';
import { usePlatformTheme } from '../services/theme';
import { getOwnerAuthorization } from '../services/ownerAdmin';
import {
  archiveOwnerMailThread,
  getOwnerMailStatus,
  getOwnerMailThread,
  listOwnerMailThreads,
  replyOwnerMailThread,
  setOwnerMailThreadRead,
  type OwnerMailConnectionStatus,
  type OwnerMailThread,
  type OwnerMailThreadSummary,
} from '../services/communications';

WebBrowser.maybeCompleteAuthSession();

const productionOAuthRelay='https://matthagersenior.github.io/Kleenest_Production/';

const gmailScopes=[
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

function enforceGmailScopes(url:string){
  const parsed=new URL(url);
  parsed.searchParams.set('scopes',gmailScopes);
  return parsed.toString();
}

function authParam(url:string,name:string){
  try{
    const parsed=new URL(url);
    return parsed.searchParams.get(name)||new URLSearchParams(parsed.hash.replace(/^#/,'')).get(name);
  }catch{
    const match=url.match(new RegExp(`[?#&]${name}=([^&#]+)`));
    return match?.[1]?decodeURIComponent(match[1]):null;
  }
}

function formatDate(value:string|null){
  if(!value)return '';
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString():value;
}

function excerpt(value:string,max=220){
  const clean=value.replace(/\s+/g,' ').trim();
  return clean.length>max?`${clean.slice(0,max-1)}…`:clean;
}

export default function Communications(){
  const theme=usePlatformTheme();
  const card=useOSCardStyle();
  const router=useRouter();
  const params=useLocalSearchParams<{code?:string;error?:string;error_description?:string}>();
  const callbackHandled=useRef('');
  const[providerToken,setProviderToken]=useState('');
  const[status,setStatus]=useState<OwnerMailConnectionStatus|null>(null);
  const[threads,setThreads]=useState<OwnerMailThreadSummary[]>([]);
  const[selected,setSelected]=useState<OwnerMailThread|null>(null);
  const[query,setQuery]=useState('');
  const[unreadOnly,setUnreadOnly]=useState(false);
  const[replyBody,setReplyBody]=useState('');
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('');
  const[searching,setSearching]=useState(false);

  const unreadCount=useMemo(()=>threads.filter(thread=>thread.unread).length,[threads]);

  async function tokenFromSession(){
    const client=getKleenestSupabaseClient();
    const{data}=await client.auth.getSession();
    return String(data.session?.provider_token||'');
  }

  async function load(nextToken?:string,options:{query?:string;unreadOnly?:boolean}={}){
    const token=nextToken||providerToken||await tokenFromSession();
    if(!token){setProviderToken('');setStatus(null);setThreads([]);return}
    setBusy(true);
    try{
      const auth=await getOwnerAuthorization();
      if(!auth.authorized)throw new Error('Owner/admin authority is required for Communications.');
      setProviderToken(token);
      const[nextStatus,nextThreads]=await Promise.all([
        getOwnerMailStatus(token),
        listOwnerMailThreads(token,{query:options.query??query,unreadOnly:options.unreadOnly??unreadOnly,maxResults:30}),
      ]);
      setStatus(nextStatus);
      setThreads(nextThreads.threads);
      setNotice('');
    }catch(error:any){
      const text=String(error?.message||'Gmail could not be loaded.');
      if(/401|unauth|token|credential|insufficient authentication scopes/i.test(text)){setProviderToken('');setStatus(null);setThreads([])}
      setNotice(/insufficient authentication scopes/i.test(text)
        ? 'Google returned without the Gmail permission KleenestOS needs. Reconnect Gmail and approve mailbox access. If Google never offers Gmail access, the Google OAuth consent screen must enable the Gmail modify scope.'
        : text);
    }finally{setBusy(false);setSearching(false)}
  }

  async function finishGmailOAuth(urlOrCode:string,originalSession?:any){
    const client=getKleenestSupabaseClient();
    const oauthError=urlOrCode.includes('://')
      ? authParam(urlOrCode,'error_description')||authParam(urlOrCode,'error')
      : '';
    if(oauthError)throw new Error(oauthError);
    const code=urlOrCode.includes('://')?authParam(urlOrCode,'code'):urlOrCode;
    if(!code)throw new Error('Google returned to KleenestOS without an authorization code.');

    const before=originalSession??(await client.auth.getSession()).data.session;
    const{error:exchangeError}=await client.auth.exchangeCodeForSession(code);
    if(exchangeError)throw exchangeError;

    const{data:{session:connectedSession}}=await client.auth.getSession();
    if(!connectedSession)throw new Error('Google connected, but no Owner session was returned.');
    if(before&&connectedSession.user.id!==before.user.id){
      await client.auth.setSession({access_token:before.access_token,refresh_token:before.refresh_token});
      throw new Error('Choose the Google account tied to this Owner identity. The original Owner session was restored safely.');
    }
    const token=String(connectedSession.provider_token||'');
    if(!token)throw new Error('Google connected, but Gmail authorization was not returned. Reconnect and approve Gmail access.');
    const auth=await getOwnerAuthorization();
    if(!auth.authorized)throw new Error('The connected Google account does not have Owner/admin authority.');
    await load(token);
    return token;
  }

  useEffect(()=>{
    const code=typeof params.code==='string'?params.code:'';
    const oauthError=(typeof params.error_description==='string'?params.error_description:'')||(typeof params.error==='string'?params.error:'');
    const callbackKey=code||oauthError;
    if(callbackKey&&callbackHandled.current!==callbackKey){
      callbackHandled.current=callbackKey;
      setBusy(true);setNotice('');
      (async()=>{
        try{
          if(oauthError)throw new Error(oauthError);
          await finishGmailOAuth(code);
          setNotice('Gmail connected.');
        }catch(error:any){
          setNotice(String(error?.message||'Gmail connection failed.'));
        }finally{
          setBusy(false);
          router.replace('/communications');
        }
      })();
      return;
    }
    if(!callbackKey)void load();
  },[params.code,params.error,params.error_description]);

  async function connectGmail(){
    if(busy)return;
    const client=getKleenestSupabaseClient();
    const{data:{session:ownerSession}}=await client.auth.getSession();
    if(!ownerSession){setNotice('Sign in to the Owner app before connecting Gmail.');return}
    const nativeAppOAuthReturn=Linking.createURL('communications',{scheme:'kleenest-owner',isTripleSlashed:false});
    const redirectTo=Platform.OS==='web'&&typeof window!=='undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : productionOAuthRelay;
    setBusy(true);setNotice('');
    try{
      const{data,error}=await client.auth.signInWithOAuth({
        provider: 'google',
        options:{
          redirectTo,
          skipBrowserRedirect:Platform.OS!=='web',
          scopes:gmailScopes,
          queryParams:{access_type:'offline',prompt:'consent select_account',include_granted_scopes:'true'},
        },
      });
      if(error)throw error;
      if(!data.url)throw new Error('Google did not return an authorization URL.');
      const scopedAuthorizeUrl=enforceGmailScopes(data.url);
      if(Platform.OS==='web'&&typeof window!=='undefined'){
        window.location.assign(scopedAuthorizeUrl);
        return;
      }
      const relayStart=`${productionOAuthRelay}?kleenest_oauth_start=owner-gmail&authorize=${encodeURIComponent(scopedAuthorizeUrl)}`;
      const result=await WebBrowser.openAuthSessionAsync(relayStart,nativeAppOAuthReturn);
      if(result.type==='cancel'||result.type==='dismiss'){setNotice('Gmail connection was cancelled.');return}
      if(result.type!=='success'||!result.url)throw new Error('Google did not return to KleenestOS.');
      await finishGmailOAuth(result.url,ownerSession);
      setNotice('Gmail connected.');
    }catch(error:any){
      setNotice(String(error?.message||'Gmail connection failed.'));
    }finally{setBusy(false)}
  }

  async function search(){
    setSearching(true);
    await load(undefined,{query,unreadOnly});
  }

  async function openThread(row:OwnerMailThreadSummary){
    if(!providerToken)return;
    setBusy(true);
    try{
      const result=await getOwnerMailThread(providerToken,row.id);
      setSelected(result.thread);
      setReplyBody('');
      if(result.thread.unread){
        await setOwnerMailThreadRead(providerToken,row.id,true);
        setThreads(current=>current.map(item=>item.id===row.id?{...item,unread:false}:item));
        setSelected(current=>current?{...current,unread:false}:current);
      }
      setNotice('');
    }catch(error:any){setNotice(String(error?.message||'Thread could not be opened.'))}
    finally{setBusy(false)}
  }

  async function sendReply(){
    if(!providerToken||!selected||!replyBody.trim())return;
    setBusy(true);
    try{
      await replyOwnerMailThread(providerToken,{threadId:selected.id,body:replyBody});
      setReplyBody('');
      const result=await getOwnerMailThread(providerToken,selected.id);
      setSelected(result.thread);
      setNotice('Reply sent from Gmail.');
      await load();
    }catch(error:any){setNotice(String(error?.message||'Reply could not be sent.'))}
    finally{setBusy(false)}
  }

  async function archive(threadId:string){
    if(!providerToken)return;
    setBusy(true);
    try{
      await archiveOwnerMailThread(providerToken,threadId);
      setThreads(current=>current.filter(item=>item.id!==threadId));
      if(selected?.id===threadId)setSelected(null);
      setNotice('Conversation archived in Gmail.');
    }catch(error:any){setNotice(String(error?.message||'Conversation could not be archived.'))}
    finally{setBusy(false)}
  }

  async function markUnread(threadId:string){
    if(!providerToken)return;
    setBusy(true);
    try{
      await setOwnerMailThreadRead(providerToken,threadId,false);
      setThreads(current=>current.map(item=>item.id===threadId?{...item,unread:true}:item));
      if(selected?.id===threadId)setSelected(current=>current?{...current,unread:true}:current);
      setNotice('Conversation marked unread.');
    }catch(error:any){setNotice(String(error?.message||'Read state could not be updated.'))}
    finally{setBusy(false)}
  }

  if(!providerToken||!status){
    return <ScrollView contentContainerStyle={{padding:16,gap:16,paddingBottom:70,backgroundColor:theme.canvas}}>
      <OSHero eyebrow="KLEENESTOS · COMMUNICATIONS" title="Email inbox" body="Read and respond to Kleenest outreach, partnership and prospect email without leaving the Owner app. Gmail access is granted explicitly and stays behind Owner authorization."/>
      {notice?<View style={{...card,borderColor:theme.warning}}><Text style={{fontWeight:'800',color:theme.warning}}>{notice}</Text></View>:null}
      <View style={{...card,gap:10}}>
        <SectionHeader title="Connect your mailbox" body="KleenestOS requests Gmail read, modify and send permission so this screen can show conversations, reply in-thread, archive, and manage unread state."/>
        <Pressable disabled={busy} onPress={connectGmail} style={{backgroundColor:theme.accent,borderRadius:14,padding:14,alignItems:'center',opacity:busy?0.6:1}}>
          <Text style={{fontWeight:'900',color:theme.accentText}}>{busy?'Connecting…':'Connect Gmail'}</Text>
        </Pressable>
        <Text style={{fontSize:12,lineHeight:18,color:theme.muted}}>No Gmail password is stored in KleenestOS. If Google access expires, this screen asks you to reconnect.</Text>
      </View>
    </ScrollView>;
  }

  return <ScrollView refreshControl={<RefreshControl refreshing={busy&&!searching} onRefresh={()=>void load()}/>} contentContainerStyle={{padding:16,gap:14,paddingBottom:80,backgroundColor:theme.canvas}}>
    <OSHero eyebrow="KLEENESTOS · COMMUNICATIONS" title="Communications & Email" body="Inbox, prospect context, and replies in one Owner workflow.">
      <StatusPill label={status.emailAddress||'GMAIL CONNECTED'} tone="good"/>
      {unreadCount?<StatusPill label={`${unreadCount} UNREAD`} tone="warning"/>:null}
    </OSHero>

    {notice?<View style={{...card,borderColor:theme.warning}}><Text style={{fontWeight:'800',color:theme.warning}}>{notice}</Text></View>:null}

    <View style={{...card,gap:10}}>
      <Text style={{fontWeight:'900',color:theme.ink}}>Search mail</Text>
      <View style={{flexDirection:'row',gap:8}}>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} placeholder="Sender, company, subject, keywords…" placeholderTextColor={theme.muted} style={{flex:1,borderWidth:1,borderColor:theme.line,borderRadius:12,paddingHorizontal:12,paddingVertical:10,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
        <Pressable onPress={()=>void search()} style={{justifyContent:'center',paddingHorizontal:14,borderRadius:12,backgroundColor:theme.accent}}><Text style={{fontWeight:'900',color:theme.accentText}}>{searching?'…':'Search'}</Text></Pressable>
      </View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <Pressable onPress={()=>{const next=!unreadOnly;setUnreadOnly(next);void load(undefined,{unreadOnly:next})}} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:unreadOnly?theme.accent:theme.accentSoft}}><Text style={{fontWeight:'900',color:unreadOnly?theme.accentText:theme.accent}}>Unread</Text></Pressable>
        <Pressable onPress={()=>void load()} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Refresh</Text></Pressable>
        <Pressable onPress={connectGmail} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:999,backgroundColor:theme.surfaceRaised,borderWidth:1,borderColor:theme.line}}><Text style={{fontWeight:'900',color:theme.ink}}>Reconnect Gmail</Text></Pressable>
      </View>
    </View>

    {selected?<View style={{...card,gap:12,borderColor:theme.accent}}>
      <View style={{flexDirection:'row',alignItems:'flex-start',gap:10}}>
        <View style={{flex:1}}>
          <Text style={{fontSize:20,fontWeight:'900',color:theme.ink}}>{selected.subject}</Text>
          <Text style={{fontSize:12,color:theme.muted,marginTop:3}}>{selected.messages.length} message{selected.messages.length===1?'':'s'}</Text>
        </View>
        <Pressable onPress={()=>setSelected(null)}><Text style={{fontWeight:'900',color:theme.accent}}>Close</Text></Pressable>
      </View>
      {selected.messages.map(message=><View key={message.id} style={{padding:12,borderRadius:13,backgroundColor:theme.surfaceRaised,borderWidth:1,borderColor:theme.line,gap:6}}>
        <Text style={{fontWeight:'900',color:theme.ink}}>{message.sent?'You':message.from}</Text>
        <Text style={{fontSize:11,color:theme.muted}}>{formatDate(message.date)}</Text>
        <Text selectable style={{lineHeight:20,color:theme.ink}}>{message.body||message.snippet}</Text>
      </View>)}
      <View style={{gap:7}}>
        <Text style={{fontWeight:'900',color:theme.ink}}>Reply</Text>
        <TextInput value={replyBody} onChangeText={setReplyBody} multiline placeholder="Write your reply…" placeholderTextColor={theme.muted} style={{minHeight:120,textAlignVertical:'top',borderWidth:1,borderColor:theme.line,borderRadius:13,padding:12,color:theme.ink,backgroundColor:theme.surfaceRaised}}/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
          <Pressable disabled={!replyBody.trim()||busy} onPress={()=>void sendReply()} style={{paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:theme.accent,opacity:(!replyBody.trim()||busy)?0.5:1}}><Text style={{fontWeight:'900',color:theme.accentText}}>Reply</Text></Pressable>
          <Pressable onPress={()=>void markUnread(selected.id)} style={{paddingHorizontal:12,paddingVertical:10,borderRadius:12,backgroundColor:theme.accentSoft}}><Text style={{fontWeight:'900',color:theme.accent}}>Mark unread</Text></Pressable>
          <Pressable onPress={()=>void archive(selected.id)} style={{paddingHorizontal:12,paddingVertical:10,borderRadius:12,backgroundColor:theme.surfaceRaised,borderWidth:1,borderColor:theme.line}}><Text style={{fontWeight:'900',color:theme.ink}}>Archive</Text></Pressable>
        </View>
      </View>
    </View>:null}

    <View style={{gap:9}}>
      <SectionHeader title="Inbox" body={threads.length?`${threads.length} recent conversation${threads.length===1?'':'s'} · tap one to read and respond.`:'No matching inbox conversations.'}/>
      {threads.map(thread=><Pressable key={thread.id} onPress={()=>void openThread(thread)} style={{...card,gap:6,borderColor:thread.unread?theme.accent:theme.line}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <Text numberOfLines={1} style={{flex:1,fontWeight:thread.unread?'900':'800',color:theme.ink}}>{thread.from}</Text>
          {thread.unread?<StatusPill label="UNREAD" tone="warning"/>:null}
        </View>
        <Text numberOfLines={1} style={{fontSize:16,fontWeight:'900',color:theme.ink}}>{thread.subject}</Text>
        <Text numberOfLines={2} style={{lineHeight:18,color:theme.muted}}>{excerpt(thread.snippet)}</Text>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
          <Text style={{fontSize:11,color:theme.muted}}>{formatDate(thread.date)} · {thread.messageCount} message{thread.messageCount===1?'':'s'}</Text>
          <View style={{flexDirection:'row',gap:8}}>
            <Pressable onPress={event=>{event.stopPropagation();void markUnread(thread.id)}}><Text style={{fontWeight:'900',color:theme.accent}}>Mark unread</Text></Pressable>
            <Pressable onPress={event=>{event.stopPropagation();void archive(thread.id)}}><Text style={{fontWeight:'900',color:theme.muted}}>Archive</Text></Pressable>
          </View>
        </View>
      </Pressable>)}
    </View>
  </ScrollView>;
}
