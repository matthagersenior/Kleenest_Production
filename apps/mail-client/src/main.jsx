import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';

const URL = import.meta.env.VITE_SUPABASE_URL || 'https://ssgesjzdvdsqacdtasje.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = KEY ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'kleenest-mail-auth' } }) : null;
const FOLDERS = [
  ['inbox','Inbox'], ['sent','Sent'], ['drafts','Drafts'], ['archive','Archive'],
  ['spam','Spam'], ['trash','Trash'], ['all','All mail']
];
const emptyDraft = () => ({ to:'', cc:'', bcc:'', subject:'', body:'', draftId:'' });
const message = e => String(e?.message || e || 'Something went wrong.');
const fmt = d => d ? new Date(d).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '';
function Logo() { return <div className="logo"><span aria-hidden="true">✉</span> Kleenest <b>Mail</b></div>; }
async function invoke(functionName, payload) {
  if(!supabase) throw new Error('Missing public Supabase configuration.');
  const { data:{ session }, error } = await supabase.auth.getSession();
  if(error || !session?.access_token) throw new Error('Your sign-in expired. Sign in again.');
  const response = await fetch(URL + '/functions/v1/' + functionName, {
    method:'POST', headers:{'content-type':'application/json', apikey:KEY, authorization:'Bearer ' + session.access_token},
    body:JSON.stringify(payload), cache:'no-store',
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok || body.error) throw new Error(body.error || 'Mail request failed (' + response.status + ').');
  return body;
}
function App() {
  const [user,setUser]=useState(null), [recover,setRecover]=useState(false);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[nextPassword,setNextPassword]=useState('');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [online,setOnline]=useState(navigator.onLine);
  const [installPrompt,setInstallPrompt]=useState(null);
  const [mailboxes,setMailboxes]=useState([]),[mailboxId,setMailboxId]=useState('');
  const [folder,setFolder]=useState('inbox'),[threads,setThreads]=useState([]),[thread,setThread]=useState(null);
  const [search,setSearch]=useState(''),[unreadOnly,setUnreadOnly]=useState(false);
  const [compose,setCompose]=useState(false),[draft,setDraft]=useState(emptyDraft());
  const [reply,setReply]=useState(''),[forwardTo,setForwardTo]=useState(''),[forwardBody,setForwardBody]=useState('');
  const [labelName,setLabelName]=useState(''),[status,setStatus]=useState(null);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    if(!supabase) return;
    let active=true;
    supabase.auth.getSession().then(({data})=>{if(active)setUser(data.session?.user || null);}).catch(e=>setNotice(message(e)));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      setUser(session?.user || null);
      if(event==='PASSWORD_RECOVERY')setRecover(true);
      if(event==='SIGNED_OUT'){setThreads([]);setThread(null);setMailboxes([]);}
    });
    const setConnected=()=>setOnline(navigator.onLine);
    const onInstall=e=>{e.preventDefault();setInstallPrompt(e);};
    window.addEventListener('online',setConnected);window.addEventListener('offline',setConnected);
    window.addEventListener('beforeinstallprompt',onInstall);
    if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
    return ()=>{active=false;subscription.unsubscribe();window.removeEventListener('online',setConnected);window.removeEventListener('offline',setConnected);window.removeEventListener('beforeinstallprompt',onInstall);};
  },[]);

  async function task(run) {
    setBusy(true);setNotice('');
    try{return await run();} catch(e){setNotice(message(e));return null;} finally{setBusy(false);}
  }
  async function logIn(e){e.preventDefault();await task(async()=>{
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
    setPassword('');
  });}
  async function googleSignIn(){await task(async()=>{
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
    if(error)throw error;
  });}
  async function resetPassword(){await task(async()=>{
    if(!email.trim())throw new Error('Enter your account email first.');
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});
    if(error)throw error;
    setNotice('Check your inbox for the password reset link.');
  });}
  async function updatePassword(e){e.preventDefault();await task(async()=>{
    if(nextPassword.length<8)throw new Error('Use a password of at least 8 characters.');
    const {error}=await supabase.auth.updateUser({password:nextPassword});
    if(error)throw error;setRecover(false);setNextPassword('');setNotice('Password changed.');
  });}
  async function loadDirectory(){
    const [m,s]=await Promise.all([
      invoke('owner-email-directory',{action:'list_mailboxes'}),
      invoke('owner-email-center',{action:'status'})
    ]);
    const allowed=(m.mailboxes||[]).filter(x=>x.active && x.mailbox_type!=='system');
    setMailboxes(allowed);setStatus(s);
    setMailboxId(v=>allowed.some(x=>x.id===v)?v:(allowed[0]?.id||''));
    if(!allowed.length)setNotice('No mailbox is assigned to this account. Ask your Kleenest Mail administrator for access.');
  }
  async function loadThreads(which=folder, mailbox=mailboxId, query=search, unread=unreadOnly){
    if(!mailbox)return;
    setLoading(true);
    try{
      const res=await invoke('owner-email-center',{action:'list_threads',mailbox:which,mailboxId:mailbox,query,unreadOnly:unread,maxResults:100});
      setThreads(res.threads||[]);
    }catch(e){setNotice(message(e));setThreads([]);}finally{setLoading(false);}
  }
  useEffect(()=>{if(user)loadDirectory().catch(e=>setNotice(message(e)));},[user?.id]);
  useEffect(()=>{if(user&&mailboxId)loadThreads();},[user?.id,mailboxId,folder,unreadOnly]);
  async function openThread(t) {
    await task(async()=>{
      const res=await invoke('owner-email-center',{action:'get_thread',threadId:t.id});
      setThread(res.thread);
      setReply('');setForwardTo('');setForwardBody('');
      if(t.unread){await invoke('owner-email-center',{action:'set_read',threadId:t.id,read:true});await loadThreads();}
    });
  }
  async function action(type,extra={},close=false) {
    if(!thread)return;
    await task(async()=>{
      await invoke('owner-email-center',{action:type,threadId:thread.id,...extra});
      if(close){setThread(null);}else{
        const res=await invoke('owner-email-center',{action:'get_thread',threadId:thread.id});setThread(res.thread);
      }
      await loadThreads();
    });
  }
  async function sendDraft(e) {
    e.preventDefault();
    await task(async()=>{
      const fn='owner-email-center';
      await invoke(fn,{action:'send',mailboxId,to:draft.to,cc:draft.cc,bcc:draft.bcc,subject:draft.subject,body:draft.body});
      if(draft.draftId)await invoke(fn,{action:'trash',threadId:draft.draftId});
      setCompose(false);setDraft(emptyDraft());setFolder('sent');setThread(null);
      await loadThreads('sent');setNotice('Message handed to the email provider. Check Sent for delivery state.');
    });
  }
  async function saveDraft() {
    await task(async()=>{
      await invoke('owner-email-center',{action:'save_draft',mailboxId,draftId:draft.draftId,to:draft.to,cc:draft.cc,bcc:draft.bcc,subject:draft.subject,body:draft.body});
      setCompose(false);setDraft(emptyDraft());setFolder('drafts');setThread(null);await loadThreads('drafts');setNotice('Draft saved.');
    });
  }
  async function editDraft(t) {
    await task(async()=>{
      const res=await invoke('owner-email-center',{action:'get_thread',threadId:t.id});
      const m=res.thread.messages.at(-1);
      setDraft({to:m?.to||'',cc:m?.cc||'',bcc:m?.bcc||'',subject:m?.subject||'',body:m?.body||'',draftId:t.id});
      setThread(null);setCompose(true);
    });
  }
  async function respond(all=false) {
    await task(async()=>{
      await invoke('owner-email-center',{action:'reply',threadId:thread.id,body:reply,replyAll:all});
      setReply('');const res=await invoke('owner-email-center',{action:'get_thread',threadId:thread.id});setThread(res.thread);await loadThreads();
    });
  }
  async function forward() {
    await task(async()=>{
      await invoke('owner-email-center',{action:'forward',threadId:thread.id,to:forwardTo,body:forwardBody});
      setForwardTo('');setForwardBody('');setNotice('Forward sent.');await loadThreads();
    });
  }
  async function install(){if(!installPrompt)return;await installPrompt.prompt();setInstallPrompt(null);}
  const mailbox=useMemo(()=>mailboxes.find(m=>m.id===mailboxId),[mailboxes,mailboxId]);
  if(!supabase)return <main className="authentication"><Logo/><h2>Mail configuration needed</h2><p>A publishable Supabase key is missing from this deployment.</p></main>;
  return <div className="app">
    <header className="header"><Logo/><span className="header-right">
      {!online&&<span className="offline">Offline: mail unavailable</span>}
      {installPrompt&&<button type="button" className="small" onClick={install}>Install app</button>}
      {user&&<button type="button" className="small" onClick={()=>supabase.auth.signOut()}>Sign out</button>}
    </span></header>
    {!user ? <main className="authentication"><section className="panel">
      <span className="overline">SECURE KLEENEST EMAIL</span><h1>Your mail, wherever you are.</h1>
      <p>Use your existing Kleenest account. Your personal and shared addresses are available according to your assigned permissions.</p>
      <form onSubmit={logIn}><label>Account email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button className="primary" disabled={busy}>Sign in</button></form>
      <div className="auth-secondary"><button type="button" onClick={googleSignIn} disabled={busy}>Continue with Google</button><button type="button" onClick={resetPassword} disabled={busy}>Reset password</button></div>
      <p className="fine">Mail access is granted by Kleenest administrators; signing up is not available here.</p>
      </section></main>
    :recover?<main className="authentication"><section className="panel"><h1>Change your password</h1><form onSubmit={updatePassword}><label>New password<input type="password" autoComplete="new-password" value={nextPassword} onChange={e=>setNextPassword(e.target.value)}/></label><button className="primary" disabled={busy}>Save password</button></form></section></main>
    :<div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-heading"><span className="overline">MAILBOX</span><select aria-label="Choose mailbox" value={mailboxId} onChange={e=>{setMailboxId(e.target.value);setThread(null);}}>{mailboxes.map(m=><option key={m.id} value={m.id}>{m.address}</option>)}</select></div>
        <button className="primary compose-button" disabled={!mailbox||busy||!mailbox.send_enabled} onClick={()=>{setCompose(true);setThread(null);setDraft(emptyDraft());}}>＋ Compose</button>
        <nav aria-label="Mail folders" className="folders">{FOLDERS.map(([value,label])=><button key={value} className={folder===value?'selected':''} onClick={()=>{setFolder(value);setThread(null);setCompose(false);}}>{label}</button>)}</nav>
        <div className="sidebar-foot"><a href="../owner/communications">KleenestOS Email Center ↗</a><p>Private messages are not available offline.</p></div>
      </aside>
      <section className="threads">
        <div className="pane-head"><div><span className="overline">{mailbox?.address||'NO MAILBOX'}</span><h2>{FOLDERS.find(x=>x[0]===folder)?.[1]}</h2></div><button className="small" onClick={()=>loadThreads()} disabled={!mailbox||loading}>↻ Refresh</button></div>
        <form className="search" onSubmit={e=>{e.preventDefault();loadThreads();}}><input aria-label="Search mail" placeholder="Search subject or message…" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit">Search</button></form>
        <label className="check"><input type="checkbox" checked={unreadOnly} onChange={e=>setUnreadOnly(e.target.checked)}/> Unread only</label>
        <div className="thread-list">{loading?<p className="empty">Loading messages…</p>:!threads.length?<p className="empty">No conversations in this folder.</p>:threads.map(t=><button key={t.id} className={'thread-item'+(thread?.id===t.id?' active':'')+(t.unread?' unread':'')} onClick={()=>folder==='drafts'?editDraft(t):openThread(t)}>
          <span className="thread-line"><b>{t.from||t.fromEmail||'No sender'}</b><small>{fmt(t.date)}</small></span>
          <strong>{t.subject||'(no subject)'}</strong><span className="preview">{t.snippet||'No preview'}</span>
          <span className="thread-flags">{t.starred?'★ ':''}{t.hasAttachment?'📎 ':''}{t.latestDeliveryStatus&&t.latestSent?String(t.latestDeliveryStatus).replaceAll('_',' '):''}</span>
        </button>)}</div>
      </section>
      <main className={'reading '+(thread||compose?'reading-active':'')}>
        {compose ? <div className="reader-content"><div className="pane-head"><h2>{draft.draftId?'Edit draft':'New message'}</h2><button className="small" onClick={()=>setCompose(false)}>Close</button></div><div className="sender">From: {mailbox?.address||'Select a mailbox'}</div>
          <form className="editor" onSubmit={sendDraft}>
            {['to','cc','bcc','subject'].map(k=><label key={k}>{k.toUpperCase()}<input required={k==='to'||k==='subject'} type={k==='subject'?'text':'text'} value={draft[k]} onChange={e=>setDraft(d=>({...d,[k]:e.target.value}))}/></label>)}
            <label>Message<textarea rows="12" required value={draft.body} onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/></label>
            <div className="actions"><button className="primary" disabled={busy||!mailbox?.send_enabled}>Send</button><button type="button" disabled={busy} onClick={saveDraft}>Save draft</button></div>
          </form></div>
        :thread ? <div className="reader-content">
          <div className="pane-head"><div><button className="small mobile-back" onClick={()=>setThread(null)}>← Messages</button><span className="overline">{thread.mailboxAddress}</span><h2>{thread.subject}</h2></div><button className="small" onClick={()=>setThread(null)}>Close</button></div>
          <div className="actions wrap">
            <button disabled={busy} onClick={()=>action('star',{starred:!thread.starred})}>{thread.starred?'☆ Unstar':'★ Star'}</button>
            <button disabled={busy} onClick={()=>action('set_read',{read:thread.unread})}>{thread.unread?'Mark read':'Mark unread'}</button>
            {thread.folder==='inbox'?<button disabled={busy} onClick={()=>action('archive',{},true)}>Archive</button>:<button disabled={busy} onClick={()=>action('set_inbox',{inInbox:true},true)}>Move to inbox</button>}
            <button disabled={busy} onClick={()=>action('spam',{},true)}>Spam</button>
            <button disabled={busy} onClick={()=>action('trash',{},true)}>Trash</button>
            <button disabled={busy} onClick={()=>action('block_sender',{},true)}>Block sender</button>
          </div>
          <div className="messages">{thread.messages?.map(m=><article key={m.id} className="message">
            <div className="message-head"><b>{m.from||m.fromEmail}</b><time>{fmt(m.date)}</time></div>
            <div className="fine">To: {m.to} {m.cc?' · Cc: '+m.cc:''}{m.deliveryStatus?' · '+m.deliveryStatus:''}</div>
            <div className="message-body">{m.body||m.snippet||'(empty message)'}</div>
            {m.attachments?.length>0&&<div className="attachment-list">Attachments: {m.attachments.map(a=>a.filename).join(', ')} <small>(download not yet available)</small></div>}
          </article>)}</div>
          <section className="reply-area"><h3>Reply</h3><textarea rows="5" value={reply} onChange={e=>setReply(e.target.value)} placeholder="Write a reply…"/>
            <div className="actions wrap"><button className="primary" disabled={busy||!reply.trim()} onClick={()=>respond(false)}>Reply</button><button disabled={busy||!reply.trim()} onClick={()=>respond(true)}>Reply all</button></div>
            <h3>Forward</h3><input type="text" placeholder="Recipient email" value={forwardTo} onChange={e=>setForwardTo(e.target.value)}/><textarea rows="3" value={forwardBody} onChange={e=>setForwardBody(e.target.value)} placeholder="Optional note"/>
            <button disabled={busy||!forwardTo.trim()} onClick={forward}>Forward message</button>
            <h3>Labels</h3><div className="actions wrap">{(thread.labelNames||[]).map(l=><button key={l} disabled={busy} onClick={()=>action('set_label',{labelName:l,applied:false})}>{l} ×</button>)}</div>
            <div className="actions"><input placeholder="New label" value={labelName} onChange={e=>setLabelName(e.target.value)}/><button disabled={busy||!labelName.trim()} onClick={async()=>{await action('set_label',{labelName,applied:true});setLabelName('');}}>Add label</button></div>
          </section>
        </div> : <div className="welcome"><div className="welcome-icon">✉</div><h2>Welcome to Kleenest Mail</h2><p>Select a conversation or compose a new message.</p><p className="fine">Delivery is handled securely by KleenestOS and Resend. Messages are not stored in this browser's offline cache.</p></div>}
      </main>
    </div>}
    {notice&&<div role="status" className="notice"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss">×</button></div>}
    <footer>© Kleenest · <a href="../legal/privacy.html">Privacy</a> · <span>{status?.connected?'Mail provider connected':'Authenticated mail service'}</span></footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
