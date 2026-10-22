import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { getKleenestSupabaseClient } from './client';

function newSecureGuestSession():string|null{
  const cryptoObj=(globalThis as any)?.crypto;
  if(typeof cryptoObj?.randomUUID==='function')return 'guest-'+cryptoObj.randomUUID();
  if(typeof cryptoObj?.getRandomValues==='function'){
    const bytes=new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return 'guest-'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  return null;
}
// Analytics never treats a weak random value as a unique visitor or rate-limit key.
const guestSession=newSecureGuestSession();
export const getKleenestGuestSessionId=()=>{
  if(!guestSession)throw new Error('Secure guest session identifier unavailable.');
  return guestSession;
};

/** Foreground usage only. Auth changes refresh the identity; tokens refreshing are not activity. */
export function useAppActivity(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inFlight = false;
    const client = getKleenestSupabaseClient();
    const visible = () => AppState.currentState === 'active' &&
      (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible');
    const sync = async () => {
      if (stopped || inFlight || !visible() || !guestSession) return;
      inFlight = true;
      try { await client.rpc('record_app_activity', { p_guest_session: guestSession }); }
      catch { /* Analytics must never block the user's app. */ }
      finally { inFlight = false; }
    };
    void sync();
    const timer = setInterval(() => { void sync(); }, 60_000);
    const state = AppState.addEventListener('change', () => { void sync(); });
    const { data: auth } = client.auth.onAuthStateChange(() => { setTimeout(() => { void sync(); }, 0); });
    const onVisible = () => { void sync(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true; clearInterval(timer); state.remove(); auth.subscription.unsubscribe();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
