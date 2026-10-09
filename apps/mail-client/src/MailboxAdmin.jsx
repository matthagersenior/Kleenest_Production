import React, { useEffect, useState } from 'react';

const blank={displayName:'',sendEnabled:true,active:true,signatureText:'',forwardingEnabled:false,forwardingTargets:'',keepCopy:true,autoReplyEnabled:false,autoReplySubject:'',autoReplyBody:''};
const settingsFor=m=>({
  displayName:m.display_name||'',sendEnabled:Boolean(m.send_enabled),active:Boolean(m.active),
  signatureText:m.signature_text||'',forwardingEnabled:Boolean(m.forwarding_enabled),
  forwardingTargets:(m.forwarding_targets||[]).join(', '),keepCopy:Boolean(m.keep_copy),
  autoReplyEnabled:Boolean(m.auto_reply_enabled),autoReplySubject:m.auto_reply_subject||'',autoReplyBody:m.auto_reply_body||''
});
const errorText=e=>String(e?.message||e||'Mailbox action failed.');
const roles=['viewer','responder','manager','owner'];

export default function MailboxAdmin({invoke,searchUsers,onClose,onChanged}){
  const [mailboxes,setMailboxes]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [settings,setSettings]=useState(blank);
  const [newAddress,setNewAddress]=useState(''),[newName,setNewName]=useState(''),[newType,setNewType]=useState('shared');
  const [alias,setAlias]=useState('');
  const [search,setSearch]=useState(''),[people,setPeople]=useState([]),[target,setTarget]=useState(null);
  const [role,setRole]=useState('responder'),[canSend,setCanSend]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');

  const selected=mailboxes.find(m=>m.id===selectedId)||null;
  async function refresh(){
    const response=await invoke('owner-email-directory',{action:'admin_overview'});
    const items=Array.isArray(response.mailboxes)?response.mailboxes:[];
    setMailboxes(items);
    if(selectedId){
      const current=items.find(m=>m.id===selectedId);
      if(current)setSettings(settingsFor(current));
      else setSelectedId('');
    }
  }
  useEffect(()=>{refresh().catch(e=>setError(errorText(e)));},[]);
  function choose(m){setSelectedId(m.id);setSettings(settingsFor(m));setError('');setNotice('')}
  async function run(action,payload,success){
    setBusy(true);setError('');setNotice('');
    try{
      await invoke('owner-email-directory',{action,...payload});
      await refresh();
      if(onChanged)await onChanged();
      setNotice(success);
    }catch(e){setError(errorText(e));}
    finally{setBusy(false)}
  }
  async function findUsers(e){
    e.preventDefault();setBusy(true);setError('');
    try{setPeople(await searchUsers(search))}catch(e){setError(errorText(e))}
    finally{setBusy(false)}
  }
  const update=(key,value)=>setSettings(s=>({...s,[key]:value}));
  const field=(label,key,multiline=false)=><label>{label}{multiline
    ?<textarea rows="3" value={settings[key]} onChange={e=>update(key,e.target.value)}/>
    :<input value={settings[key]} onChange={e=>update(key,e.target.value)}/>}</label>;
  const check=(label,key)=><label className="check"><input type="checkbox" checked={settings[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>;

  return <main className="mail-admin" aria-label="Mailbox administration">
    <div className="pane-head"><div><span className="overline">PLATFORM OWNER ONLY</span><h1>Mailbox management</h1><p>Create addresses, aliases and delegated access using the same directory as KleenestOS.</p></div>
      <button className="small" onClick={onClose}>← Inbox</button></div>
    {error&&<p role="alert" className="notice">{error}</p>}
    {notice&&<p role="status" className="fine">{notice}</p>}
    <section className="panel"><h2>Domain mailboxes</h2>
      <div className="actions wrap"><button onClick={()=>refresh().catch(e=>setError(errorText(e)))} disabled={busy}>Refresh</button>
        {mailboxes.map(m=><button key={m.id} className={selectedId===m.id?'primary':''} disabled={busy} onClick={()=>choose(m)}>{m.address} {m.active?'':'(inactive)'}</button>)}</div>
    </section>
    <section className="panel"><h2>Create a mailbox</h2>
      <div className="editor"><label>Address @kleenest.us<input type="email" value={newAddress} onChange={e=>setNewAddress(e.target.value)} placeholder="support@kleenest.us"/></label>
        <label>Display name<input value={newName} onChange={e=>setNewName(e.target.value)}/></label>
        <label>Type<select value={newType} onChange={e=>setNewType(e.target.value)}><option value="shared">Shared</option><option value="personal">Personal</option></select></label>
        {newType==='personal'&&<p className="fine">Select the account owner in Account lookup before creating a personal mailbox.</p>}
        <button className="primary" disabled={busy||!newAddress.trim()||(newType==='personal'&&!target?.id)} onClick={()=>run('create_mailbox',{address:newAddress,displayName:newName||newAddress.split('@')[0],mailboxType:newType,ownerUserId:newType==='personal'?target.id:undefined},'Mailbox created.')}>Create mailbox</button></div>
    </section>
    {selected&&selected.mailbox_type!=='system'&&<section className="panel"><h2>Settings · {selected.address}</h2>
      <div className="editor">
        {field('Display name','displayName')}
        {check('Active mailbox','active')}{check('Allow sending','sendEnabled')}
        {field('Email signature','signatureText',true)}
        {check('Forward incoming mail','forwardingEnabled')}
        {settings.forwardingEnabled&&<><label>Forwarding addresses (comma separated)<input value={settings.forwardingTargets} onChange={e=>update('forwardingTargets',e.target.value)}/></label>{check('Keep a copy in Kleenest Mail','keepCopy')}</>}
        {check('Automatic reply','autoReplyEnabled')}
        {settings.autoReplyEnabled&&<>{field('Auto-reply subject','autoReplySubject')}{field('Auto-reply body','autoReplyBody',true)}</>}
        <button className="primary" disabled={busy||!settings.displayName.trim()} onClick={()=>run('update_mailbox',{mailboxId:selected.id,displayName:settings.displayName,sendEnabled:settings.sendEnabled,active:settings.active,signatureText:settings.signatureText,forwardingEnabled:settings.forwardingEnabled,forwardingTargets:settings.forwardingTargets.split(',').map(x=>x.trim()).filter(Boolean),keepCopy:settings.keepCopy,autoReplyEnabled:settings.autoReplyEnabled,autoReplySubject:settings.autoReplySubject,autoReplyBody:settings.autoReplyBody},'Mailbox settings saved.')}>Save mailbox settings</button>
      </div>
      <h3>Aliases</h3><div className="actions wrap">{(selected.aliases||[]).map(a=><button key={a.alias_address} disabled={busy} onClick={()=>run(a.active?'remove_alias':'add_alias',{mailboxId:selected.id,alias:a.alias_address},a.active?'Alias disabled.':'Alias restored.')}>{a.alias_address} · {a.active?'Disable':'Restore'}</button>)}</div>
      <div className="actions"><input aria-label="New alias" placeholder="help@kleenest.us" value={alias} onChange={e=>setAlias(e.target.value)}/><button disabled={busy||!alias.trim()} onClick={()=>run('add_alias',{mailboxId:selected.id,alias},'Alias added.')}>Add alias</button></div>
      <h3>Assigned accounts</h3>
      {(selected.members||[]).map(m=><div key={m.user_id} className="actions wrap"><span>{m.email||m.user_id} · {m.access_role} · {m.can_send?'Can send':'Read only'}</span><button disabled={busy} onClick={()=>run('remove_member',{mailboxId:selected.id,userId:m.user_id},'Access revoked.')}>Revoke</button></div>)}
      <div className="editor"><label>Selected account<input readOnly value={target?.email||target?.display_name||target?.id||'Use Account lookup below'}/></label>
        <label>Role<select value={role} onChange={e=>{setRole(e.target.value);setCanSend(e.target.value!=='viewer')}}>{roles.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
        {role!=='viewer'&&<label className="check"><input type="checkbox" checked={canSend} onChange={e=>setCanSend(e.target.checked)}/>Allow sending</label>}
        <button className="primary" disabled={busy||!target?.id} onClick={()=>run('assign_member',{mailboxId:selected.id,userId:target.id,role,canSend:role!=='viewer'&&canSend},'Mailbox access updated.')}>Grant / update access</button>
      </div>
    </section>}
    <section className="panel"><h2>Account lookup</h2><p>Assign existing Kleenest members; mailbox membership does not grant Owner app access.</p>
      <form className="search" onSubmit={findUsers}><input aria-label="Search Kleenest accounts" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or sign-in email"/><button disabled={busy||!search.trim()}>Search</button></form>
      <div className="actions wrap">{people.slice(0,20).map(p=><button key={p.id} className={target?.id===p.id?'primary':''} onClick={()=>setTarget(p)}>{p.email||p.display_name||p.username||p.id}</button>)}</div>
    </section>
  </main>
}
