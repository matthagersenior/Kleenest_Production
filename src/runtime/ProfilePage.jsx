import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { identity } from '../services/identity.js';
import { getAccountSummary } from '../services/account.js';

const OWNER_NATIVE_CALLBACK='kleenest-owner://auth';
const OWNER_AUTH_KEYS=['code','access_token','refresh_token','token_hash','type','error','error_code','error_description','state'];

function ownerNativeCallbackUrl(rawUrl) {
  try {
    const parsed=new URL(rawUrl);
    const search=new URLSearchParams(parsed.search);
    const hash=new URLSearchParams(parsed.hash.replace(/^#/,''));
    const forwarded=new URLSearchParams();
    let hasAuthPayload=false;
    for (const key of OWNER_AUTH_KEYS) {
      const value=search.get(key) ?? hash.get(key);
      if (value == null || value === '') continue;
      forwarded.set(key,value);
      if (['code','access_token','refresh_token','token_hash','error','error_code'].includes(key)) hasAuthPayload=true;
    }
    return hasAuthPayload ? `${OWNER_NATIVE_CALLBACK}?${forwarded.toString()}` : null;
  } catch {
    return null;
  }
}

function delay(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }

export default function ProfilePage() {
  const navigate=useNavigate();
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [nativeCallback, setNativeCallback] = useState('');
  const [authMode, setAuthMode] = useState('signin');
  const [busy, setBusy] = useState(false);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);
  async function refresh(nextSession) { setSession(nextSession); if (!nextSession) { setSummary(null); setStatus('ready'); return; } try { setStatus('loading'); setSummary(await getAccountSummary()); setStatus('ready'); } catch (error) { setMessage(error?.message || 'Account details could not be loaded.'); setStatus('ready'); } }
  useEffect(() => {
    let active = true;
    let handedOff = false;
    const bootstrap = async () => {
      try {
        const current = await identity.getSession();
        if (!active) return;
        if (current) { await refresh(current); return; }
        const ownerCallback = ownerNativeCallbackUrl(window.location.href);
        if (ownerCallback) {
          await delay(900);
          if (!active) return;
          const afterUrlDetection = await identity.getSession();
          if (afterUrlDetection) { await refresh(afterUrlDetection); return; }
          handedOff = true;
          setNativeCallback(ownerCallback);
          setStatus('ready');
          setMessage('Returning this secure sign-in to KleenestOS…');
          window.location.replace(ownerCallback);
          return;
        }
        await refresh(null);
      } catch (error) {
        if (active) { setMessage(error?.message || 'Session could not be loaded.'); setStatus('ready'); }
      }
    };
    void bootstrap();
    const { data } = identity.onAuthStateChange((next) => {
      if (!active || handedOff) return;
      if (next) void refresh(next);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const signIn = async () => { setMessage(''); const { error } = await identity.signIn({ email, password }); if(error){setMessage(error.message);return;} navigate('/',{replace:true}); };
  const magicLink = async () => { setMessage(''); const { error } = await identity.signInWithMagicLink(email.trim().toLowerCase()); setMessage(error ? error.message : 'Magic link sent.'); };
  const signUp = async () => {
    if (busy) return;
    setMessage(''); setConfirmationNeeded(false);
    const normalized = email.trim().toLowerCase();
    if (!/^\\S+@\\S+\\.\\S+$/.test(normalized)) { setMessage('Enter a valid email address.'); return; }
    if (password.length < 8) { setMessage('Use a password of at least 8 characters.'); return; }
    setBusy(true);
    try {
      const { data, error } = await identity.signUp({email: normalized, password});
      if (error) throw error;
      if (data?.session) { navigate('/nearby', {replace: true}); return; }
      setConfirmationNeeded(true);
      setMessage('Check your email to confirm your free account. You can explore as a guest in the meantime.');
    } catch (error) { setMessage(error?.message || 'Account creation could not be completed.'); }
    finally { setBusy(false); }
  };
  const resendConfirmation = async () => {
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      const { error } = await identity.resendSignUpConfirmation(email.trim().toLowerCase());
      setMessage(error ? error.message : 'If confirmation is pending for this email, a new link has been requested.');
    } catch(error) { setMessage(error?.message || 'Could not request another confirmation link.'); }
    finally { setBusy(false); }
  };
  if (status === 'loading') return <section className="panel"><div className="eyebrow">ACCOUNT</div><h1>Profile</h1><p>Loading your account…</p></section>;
  if (nativeCallback) return <section className="panel"><div className="eyebrow">KLEENESTOS</div><h1>Return to the Owner app</h1><p>{message}</p><a className="primary" href={nativeCallback}>Open KleenestOS</a><p>If Android does not open the app automatically, tap the button above.</p></section>;
  if (!session) return <section className="panel">
    <div className="eyebrow">FREE KLEENEST ACCOUNT</div>
    <h1>{authMode === 'signup' ? 'Save your best restroom stops.' : 'Welcome back.'}</h1>
    <p>{authMode === 'signup' ? 'Join free to keep saved restrooms, check-ins, activity and XP across devices. No payment required; guest discovery remains available.' : 'Sign in to restore saved places, activity, notifications and progress.'}</p>
    <div className="card-actions" role="group" aria-label="Account access">
      <button className={authMode === 'signup' ? 'primary' : 'secondary'} onClick={() => {setAuthMode('signup');setMessage('');}}>Create free account</button>
      <button className={authMode === 'signin' ? 'primary' : 'secondary'} onClick={() => {setAuthMode('signin');setMessage('');}}>Sign in</button>
    </div>
    <form className="auth-form" onSubmit={event => {event.preventDefault(); if (authMode === 'signup') void signUp(); else void signIn();}}>
      <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" autoComplete="email" aria-label="Email" />
      <input type="password" required minLength={authMode === 'signup' ? 8 : 1} value={password} onChange={event => setPassword(event.target.value)} placeholder={authMode === 'signup' ? 'Password (8+ characters)' : 'Password'} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} aria-label="Password" />
      <button type="submit" className="primary" disabled={busy || !email || !password}>{busy ? 'Please wait…' : authMode === 'signup' ? 'Create free account' : 'Sign in'}</button>
      {authMode === 'signin' ? <button type="button" className="secondary" onClick={magicLink} disabled={!email || busy}>Send magic link</button> : null}
      {confirmationNeeded ? <button type="button" className="secondary" onClick={resendConfirmation} disabled={!email || busy}>Resend confirmation email</button> : null}
    </form>
    <button className="secondary" onClick={() => navigate('/nearby')}>Not now — explore as a guest</button>
    {message && <div className="notice" role="status">{message}</div>}
  </section>;
  const profile = summary?.profile || {}; const subscriptions = Array.isArray(summary?.subscriptions) ? summary.subscriptions : [];
  return <section className="panel"><div className="eyebrow">ACCOUNT</div><h1>{profile.display_name || session.user.email || 'Profile'}</h1><p>Membership: <strong>{profile.subscription_tier || 'free'}</strong></p><p>{subscriptions.length ? `${subscriptions.length} recurring account service entitlement record${subscriptions.length === 1 ? '' : 's'}.` : 'No recurring account service subscriptions.'}</p><div className="card-actions"><button className="primary" onClick={()=>navigate('/workspace')}>Workspaces</button><button className="primary" onClick={()=>navigate('/membership')}>Membership & billing</button><button className="secondary" onClick={()=>navigate('/notifications')}>Notifications</button><button className="secondary" onClick={()=>navigate('/activity')}>Activity</button><button className="secondary" onClick={()=>navigate('/social')}>Social</button></div><button className="secondary account-signout" onClick={() => identity.signOut()}>Sign out</button>{message&&<div className="notice">{message}</div>}</section>;
}