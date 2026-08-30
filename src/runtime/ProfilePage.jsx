import { useEffect, useState } from 'react';
import { identity } from '../services/identity.js';
import { getAccountSummary } from '../services/account.js';

export default function ProfilePage() {
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  async function refresh(nextSession) {
    setSession(nextSession);
    if (!nextSession) {
      setSummary(null);
      setStatus('ready');
      return;
    }
    try {
      setStatus('loading');
      setSummary(await getAccountSummary());
      setStatus('ready');
    } catch (error) {
      setMessage(error?.message || 'Account details could not be loaded.');
      setStatus('ready');
    }
  }

  useEffect(() => {
    let active = true;
    identity.getSession().then((current) => active && refresh(current)).catch((error) => {
      if (active) {
        setMessage(error?.message || 'Session could not be loaded.');
        setStatus('ready');
      }
    });
    const { data } = identity.onAuthStateChange((next) => active && refresh(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    setMessage('');
    const { error } = await identity.signIn({ email, password });
    setMessage(error ? error.message : 'Signed in.');
  };

  const magicLink = async () => {
    setMessage('');
    const { error } = await identity.signInWithMagicLink(email);
    setMessage(error ? error.message : 'Magic link sent.');
  };

  if (status === 'loading') return <section className="panel"><div className="eyebrow">ACCOUNT</div><h1>Profile</h1><p>Loading your account…</p></section>;

  if (!session) {
    return (
      <section className="panel">
        <div className="eyebrow">ACCOUNT</div>
        <h1>Sign in</h1>
        <p>Use your Kleenest account to restore membership, saved places, activity, and social features.</p>
        <div className="auth-form">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="email" />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" autoComplete="current-password" />
          <button className="primary" onClick={signIn} disabled={!email || !password}>Sign in</button>
          <button className="secondary" onClick={magicLink} disabled={!email}>Send magic link</button>
        </div>
        {message && <div className="notice">{message}</div>}
      </section>
    );
  }

  const profile = summary?.profile || {};
  const subscriptions = Array.isArray(summary?.subscriptions) ? summary.subscriptions : [];
  return (
    <section className="panel">
      <div className="eyebrow">ACCOUNT</div>
      <h1>{profile.display_name || session.user.email || 'Profile'}</h1>
      <p>Membership: <strong>{profile.subscription_tier || 'free'}</strong></p>
      <p>{subscriptions.length ? `${subscriptions.length} recurring account service entitlement record${subscriptions.length === 1 ? '' : 's'}.` : 'No recurring account service subscriptions.'}</p>
      <button className="secondary" onClick={() => identity.signOut()}>Sign out</button>
      {message && <div className="notice">{message}</div>}
    </section>
  );
}
