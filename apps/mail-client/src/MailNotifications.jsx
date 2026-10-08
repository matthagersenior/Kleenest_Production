import React,{useEffect,useState} from 'react';

function supported(){return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;}
function applicationKey(key){
  const base64=key.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(base64+'='.repeat((4-base64.length%4)%4));
  return Uint8Array.from(binary,letter=>letter.charCodeAt(0));
}
// Unsubscribe before signout: a shared device must not keep receiving the former user's alerts.
export async function removeMailSubscription(supabase,user) {
  if(!supported()||!user)return;
  const registration=await navigator.serviceWorker.ready;
  const subscription=await registration.pushManager.getSubscription();
  if(!subscription)return;
  const {error}=await supabase.from('owner_email_push_subscriptions').delete()
    .eq('user_id',user.id).eq('endpoint',subscription.endpoint);
  // Expire browser delivery even if a network error leaves a stale server row.
  await subscription.unsubscribe();
  if(error)throw error;
}
export default function MailNotifications({user,supabase,mailboxes,url,apiKey,onClose}){
  const [busy,setBusy]=useState(false);
  const [registered,setRegistered]=useState(false);
  const [permission,setPermission]=useState(supported()?Notification.permission:'unsupported');
  const [preferences,setPreferences]=useState({});
  const [notice,setNotice]=useState('');
  async function refresh(){
    const {data:settings,error}=await supabase.from('owner_email_push_preferences')
      .select('mailbox_id,enabled').eq('user_id',user.id);
    if(error)throw error;
    setPreferences(Object.fromEntries((settings||[]).map(row=>[row.mailbox_id,row.enabled])));
    const current=supported()?Notification.permission:'unsupported';
    setPermission(current);
    if(current!=='granted'){setRegistered(false);return;}
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription){setRegistered(false);return;}
    const check=await supabase.from('owner_email_push_subscriptions')
      .select('id').eq('user_id',user.id).eq('endpoint',subscription.endpoint).maybeSingle();
    if(check.error)throw check.error;
    setRegistered(Boolean(check.data));
  }
  useEffect(()=>{refresh().catch(e=>setNotice(String(e.message||e)));},[user.id]);
  async function enable(){
    if(!supported()){setNotice('Web Push is not available in this browser. Try installing Kleenest Mail from Chrome on Android.');return;}
    // Permission must be requested in the click activation, before any network awaits.
    const answer=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
    setBusy(true);setNotice('');
    try{
      const permitted=await answer;
      setPermission(permitted);
      if(permitted!=='granted')throw new Error('Notifications blocked. Enable notifications for Kleenest Mail in Android settings.');
      const response=await fetch(url+'/functions/v1/owner-email-web-push',{headers:{apikey:apiKey},cache:'no-store'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.vapid_public_key)throw new Error(result.error||'Web Push is not configured on the server.');
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription()||
        await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(result.vapid_public_key)});
      const saved=await supabase.from('owner_email_push_subscriptions').upsert({
        user_id:user.id,endpoint:subscription.endpoint,subscription:subscription.toJSON(),updated_at:new Date().toISOString()
      },{onConflict:'user_id,endpoint'});
      if(saved.error)throw saved.error;
      setRegistered(true);setNotice('New-email alerts are enabled on this device.');
    }catch(error){setNotice(String(error.message||error));}finally{setBusy(false);}
  }
  async function disable(){
    setBusy(true);setNotice('');
    try{await removeMailSubscription(supabase,user);setRegistered(false);setNotice('Alerts disabled for this device.');}
    catch(error){setNotice(String(error.message||error));}finally{setBusy(false);}
  }
  async function toggle(mailboxId,enabled){
    setBusy(true);setNotice('');
    try{
      const {error}=await supabase.from('owner_email_push_preferences').upsert({
        user_id:user.id,mailbox_id:mailboxId,enabled,updated_at:new Date().toISOString()
      },{onConflict:'user_id,mailbox_id'});
      if(error)throw error;
      setPreferences(value=>({...value,[mailboxId]:enabled}));
    }catch(error){setNotice(String(error.message||error));}finally{setBusy(false);}
  }
  async function test(){
    try{
      const registration=await navigator.serviceWorker.ready;
      await registration.showNotification('Kleenest Mail test',{
        body:'This device can display notifications.',icon:'./app-icon.png',
        tag:'kleenest-mail-device-test',data:{url:location.origin+location.pathname}
      });
    }catch(error){setNotice(String(error.message||error));}
  }
  return <div className="mail-push-backdrop" onClick={onClose}>
    <section className="mail-push-panel" role="dialog" aria-modal="true" aria-label="Mail notifications" onClick={e=>e.stopPropagation()}>
      <div className="mail-push-heading"><h2>Mail notifications</h2><button className="small" aria-label="Close notification settings" onClick={onClose}>✕</button></div>
      <p className="fine">Get background alerts on your installed Kleenest Mail app. Email subjects and message contents are hidden from push previews for privacy.</p>
      <p className="mail-push-state" role="status">{permission==='unsupported'?'Web Push is not supported here.':permission==='denied'?'Blocked in Android or browser settings':registered?'● Enabled on this device':'○ Not enabled on this device'}</p>
      <div className="actions wrap">{!registered?<button className="primary" disabled={busy||permission==='unsupported'||permission==='denied'} onClick={enable}>Enable notifications</button>
        :<><button disabled={busy} onClick={test}>Test device alert</button><button disabled={busy} onClick={disable}>Disable on this device</button></>}</div>
      {permission==='denied'&&<p className="fine">Open Android Settings → Apps → Kleenest Mail → Notifications → Allow, then reopen Kleenest Mail.</p>}
      <h3>Mailbox alerts</h3>
      <div className="mail-push-mailboxes">{mailboxes.map(mailbox=><label key={mailbox.id} className="mail-push-mailbox">
        <span>{mailbox.address}</span><input aria-label={'Notify for '+mailbox.address} type="checkbox" disabled={busy} checked={preferences[mailbox.id]!==false} onChange={e=>toggle(mailbox.id,e.target.checked)}/>
      </label>)}</div>
      <p className="fine">Mailbox preferences follow your account; enabling push is separate on each device. Revoking mailbox access stops future alerts.</p>
      {notice&&<p className="mail-push-feedback" role="status">{notice}</p>}
    </section>
  </div>;
}
